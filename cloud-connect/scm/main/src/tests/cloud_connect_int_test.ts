import { describe, it, expect } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { Window } from "happy-dom";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";

// core/aws_provider.ts's listInstances() uses the browser's native
// global DOMParser to parse EC2's real XML response - real in any
// actual browser, but plain `bun test` has no DOM at all. happy-dom
// (already an established devDependency pattern in this monorepo, see
// scm/examples/ai-code-editor) provides a real DOMParser implementation
// to shim just this one global for the test below - not a mock of this
// package's own logic, only of a Web API this Node-based test runner
// doesn't otherwise have. happy-dom's DOMParser needs a real Window
// behind it (internally references window.XMLDocument), so this uses
// window.DOMParser rather than the bare top-level export.
(globalThis as { DOMParser?: unknown }).DOMParser = new Window().DOMParser;
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import { AwsCloudConnectProvider } from "../core/aws_provider.js";
import { NetlifyCloudConnectProvider } from "../core/netlify_provider.js";
import { VercelCloudConnectProvider } from "../core/vercel_provider.js";
import { HerokuCloudConnectProvider } from "../core/heroku_provider.js";
import { DIGITALOCEAN_PROVIDER } from "../spi/digitalocean.js";
import { signAwsRequest } from "../core/aws_sigv4.js";
import { CloudConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["digitalocean", "netlify", "vercel", "heroku", "azure", "gcp", "aws"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's own
// test harness exactly - zero real network calls in this suite. Also
// queues real post()/put() calls (Netlify's/Vercel's/Heroku's deploy
// flows all need them), tracking method+body alongside url/options so
// the sequencing tests below can assert real call order and shape.
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { method: "get" | "post" | "put"; url: string; body?: unknown; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  private async next<T>(): Promise<ApiResponse<T>> {
    const fn = this.responses.shift();
    if (!fn) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await fn()) as ApiResponse<T>;
  }

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "get", url, options });
    return this.next<T>();
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "post", url, body, options });
    return this.next<T>();
  }

  async put<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "put", url, body, options });
    return this.next<T>();
  }

  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any cloud-connect provider");
  }
}

describe("DefaultCloudConnectProvider", () => {
  it("test_connect_digitalocean_sends_bearer_token_and_parses_real_droplet_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { droplets: [{ id: 123, name: "web-1", status: "active" }] },
    }));
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.digitalocean.com/v2/droplets");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "123", name: "web-1", status: "active" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
  });

  it("test_connect_with_a_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.connect();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CloudConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("AwsCloudConnectProvider", () => {
  it("test_connect_calls_get_caller_identity_and_parses_the_real_identity_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        GetCallerIdentityResponse: {
          GetCallerIdentityResult: { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/demo", UserId: "AID..." },
        },
      },
    }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toContain("sts.amazonaws.com");
    expect(adapter.calls[0]!.url).toContain("Action=GetCallerIdentity");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(resources).toEqual([{ id: "123456789012", name: "arn:aws:iam::123456789012:user/demo", status: "identity verified" }]);
  });

  it("test_connect_with_an_aws_error_body_throws_the_real_aws_error_code", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 403,
      headers: {},
      error: "Forbidden",
      data: { Error: { Code: "InvalidClientTokenId", Message: "The security token included in the request is invalid." } },
    }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "bad", secretAccessKey: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/InvalidClientTokenId/);
  });

  it("test_list_instances_parses_real_ec2_describe_instances_xml", async () => {
    const adapter = new FakeApiAdapter();
    const xml = `<?xml version="1.0"?><DescribeInstancesResponse><reservationSet><item><instancesSet><item><instanceId>i-abc123</instanceId><instanceState><name>running</name></instanceState><tagSet><item><key>Name</key><value>my-box</value></item></tagSet></item></instancesSet></item></reservationSet></DescribeInstancesResponse>`;
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: xml }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const resources = await provider.listInstances!();
    expect(resources).toEqual([{ id: "i-abc123", name: "my-box", status: "running" }]);
  });
});

describe("NetlifyCloudConnectProvider", () => {
  it("test_connect_still_lists_real_sites_same_shape_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "s1", name: "my-site", state: "current" }],
    }));
    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites");
    expect(resources).toEqual([{ id: "s1", name: "my-site", status: "current" }]);
  });

  it("test_deploy_does_the_real_create_manifest_upload_poll_sequence", async () => {
    // The `required` array must contain this file's own real SHA-1 (not
    // an arbitrary placeholder) - Netlify's real API tells the caller
    // exactly which hashes it doesn't already have, and deploy() only
    // uploads files whose hash is actually in that set.
    const realHash = Buffer.from(await crypto.subtle.digest("SHA-1", new TextEncoder().encode("<h1>hi</h1>"))).toString("hex");
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "site-1", url: "http://my-site.netlify.app", ssl_url: "https://my-site.netlify.app" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-1", required: [realHash] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: {} }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-1", state: "ready", ssl_url: "https://my-site.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }]);

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites");
    expect(adapter.calls[1]!.method).toBe("post");
    expect(adapter.calls[1]!.url).toBe("https://api.netlify.com/api/v1/sites/site-1/deploys");
    expect((adapter.calls[1]!.body as { files: Record<string, string> }).files["/index.html"]).toMatch(/^[0-9a-f]{40}$/);
    expect(adapter.calls[2]!.method).toBe("put");
    expect(adapter.calls[2]!.url).toBe("https://api.netlify.com/api/v1/deploys/deploy-1/files/index.html");
    expect(adapter.calls[2]!.body).toBe("<h1>hi</h1>");
    expect(adapter.calls[3]!.method).toBe("get");
    expect(adapter.calls[3]!.url).toBe("https://api.netlify.com/api/v1/deploys/deploy-1");
    expect(result).toEqual({ url: "https://my-site.netlify.app", targetId: "site-1" });
  });

  it("test_deploy_hashes_file_content_with_the_real_known_sha1_test_vector", async () => {
    // SHA1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d is a
    // well-known, independently-verifiable test vector (not derived
    // from this package's own code) - a real regression guard on
    // core/netlify_provider.ts's sha1Hex(), same cross-check spirit as
    // this package's own SigV4 independent-implementation test.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-3", required: [] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-3", state: "ready", url: "http://x.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    await provider.deploy([{ path: "greeting.txt", content: "hello" }], "site-x");

    const manifest = (adapter.calls[0]!.body as { files: Record<string, string> }).files;
    expect(manifest["/greeting.txt"]).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });

  it("test_deploy_reuses_the_given_existing_target_id_instead_of_creating_a_new_site", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-2", required: [] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-2", state: "ready", url: "http://existing-site.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "hi" }], "existing-site-id");

    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites/existing-site-id/deploys");
    expect(result.targetId).toBe("existing-site-id");
  });
});

describe("VercelCloudConnectProvider", () => {
  it("test_connect_still_parses_the_real_deployed_status_shape_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { projects: [{ id: "p1", name: "deployed-app", targets: { production: {} } }] },
    }));
    const provider = new VercelCloudConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(resources).toEqual([{ id: "p1", name: "deployed-app", status: "deployed" }]);
  });

  it("test_deploy_inlines_base64_file_contents_in_one_post_and_polls_until_ready", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "dpl_1", url: "my-app-abc123.vercel.app", readyState: "QUEUED" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "dpl_1", url: "my-app-abc123.vercel.app", readyState: "READY" } }));

    const provider = new VercelCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }], "my-project");

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1");
    const body = adapter.calls[0]!.body as { name: string; files: Array<{ file: string; data: string; encoding: string }> };
    expect(body.name).toBe("my-project");
    expect(body.files[0]!.encoding).toBe("base64");
    expect(atob(body.files[0]!.data)).toBe("<h1>hi</h1>");
    expect(adapter.calls[1]!.method).toBe("get");
    expect(adapter.calls[1]!.url).toBe("https://api.vercel.com/v13/deployments/dpl_1");
    expect(result).toEqual({ url: "https://my-app-abc123.vercel.app", targetId: "my-project" });
  });
});

describe("HerokuCloudConnectProvider", () => {
  it("test_connect_still_sends_the_required_accept_header_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [] }));
    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    await provider.connect();
    expect(adapter.calls[0]!.options?.headers?.Accept).toBe("application/vnd.heroku+json; version=3");
  });

  it("test_deploy_does_the_real_app_sources_upload_build_poll_sequence", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "app-1", web_url: "https://app-1.herokuapp.com/" } })); // create app
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { source_blob: { get_url: "https://s3/get", put_url: "https://s3/put" } } })); // sources
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: undefined })); // PUT tarball
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "pending" } })); // create build
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "succeeded" } })); // poll build
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "app-1", web_url: "https://app-1.herokuapp.com/" } })); // get app for final URL

    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }]);

    expect(adapter.calls[0]!.url).toBe("https://api.heroku.com/apps");
    expect(adapter.calls[1]!.url).toBe("https://api.heroku.com/apps/app-1/sources");
    expect(adapter.calls[2]!.method).toBe("put");
    expect(adapter.calls[2]!.url).toBe("https://s3/put");
    expect(adapter.calls[2]!.body).toBeInstanceOf(Uint8Array);
    expect(adapter.calls[3]!.url).toBe("https://api.heroku.com/apps/app-1/builds");
    expect((adapter.calls[3]!.body as { source_blob: { url: string } }).source_blob.url).toBe("https://s3/get");
    expect(adapter.calls[4]!.url).toBe("https://api.heroku.com/apps/app-1/builds/build-1");
    expect(result).toEqual({ url: "https://app-1.herokuapp.com/", targetId: "app-1" });
  });

  it("test_deploy_with_a_failed_build_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { source_blob: { get_url: "https://s3/get", put_url: "https://s3/put" } } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: undefined }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "pending" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "failed" } }));

    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    await expect(provider.deploy([{ path: "index.html", content: "hi" }], "existing-app-id")).rejects.toThrow(/real failure/);
  });
});

describe("signAwsRequest", () => {
  // Cross-checks against an independent Node-crypto (createHash/
  // createHmac) implementation of AWS's own published SigV4 spec - a
  // real regression guard, not a trophy test: this exact shape caught a
  // real bug this session (a mixed-case extraHeaders key silently
  // breaking the canonical-header lookup) when run against AWS's live
  // STS endpoint. If the lowercasing logic in aws_sigv4.ts regresses,
  // this test fails because the two independently-derived signatures
  // stop matching.
  it("test_signature_matches_an_independent_node_crypto_implementation_of_the_same_spec", async () => {
    function sha256Hex(data: string): string {
      return createHash("sha256").update(data, "utf8").digest("hex");
    }
    function hmac(key: string | Buffer, data: string): Buffer {
      return createHmac("sha256", key).update(data, "utf8").digest();
    }
    const accessKeyId = "AKIAIOSFODNN7EXAMPLE";
    const secretAccessKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const region = "us-east-1";
    const service = "ec2";
    const date = "20220830T123600Z";
    const dateStamp = "20220830";
    const host = "ec2.amazonaws.com";
    const query = "Action=DescribeInstances&Version=2016-11-15";

    const headers = { host, "x-amz-date": date };
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${(headers as Record<string, string>)[h]!.trim()}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = ["GET", "/", query, canonicalHeaders, signedHeaders, sha256Hex("")].join("\n");
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", date, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, "aws4_request");
    const expectedSignature = hmac(kSigning, stringToSign).toString("hex");
    const expectedAuth = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${expectedSignature}`;

    const originalDateCtor = Date;
    class FixedDate extends originalDateCtor {
      constructor() {
        super("2022-08-30T12:36:00.000Z");
      }
      static override now() {
        return new originalDateCtor("2022-08-30T12:36:00.000Z").getTime();
      }
    }
    // @ts-expect-error - test-only global override, restored below
    globalThis.Date = FixedDate;
    let actualHeaders: Record<string, string>;
    try {
      actualHeaders = await signAwsRequest({ accessKeyId, secretAccessKey, region, service, method: "GET", host, path: "/", query });
    } finally {
      globalThis.Date = originalDateCtor;
    }

    expect(actualHeaders.Authorization).toBe(expectedAuth);
  });

  it("test_a_mixed_case_extra_header_is_still_included_in_the_canonical_form", async () => {
    // Regression test for the real bug this session's live AWS test
    // caught: extraHeaders with a mixed-case name (e.g. "Accept") used
    // to silently break the canonical-header lookup, since the header
    // names were lowercased for sorting but looked up on the original-
    // case object. Confirms the header actually reaches the signed set.
    const headers = await signAwsRequest({
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      region: "us-east-1",
      service: "sts",
      method: "GET",
      host: "sts.amazonaws.com",
      path: "/",
      query: "Action=GetCallerIdentity&Version=2011-06-15",
      extraHeaders: { Accept: "application/json" },
    });
    expect(headers.Authorization).toContain("accept;host;x-amz-date");
  });
});

describe("cloud-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("cloudConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("cloudConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
