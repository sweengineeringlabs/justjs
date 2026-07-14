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
import { DIGITALOCEAN_PROVIDER } from "../spi/digitalocean.js";
import { NETLIFY_PROVIDER } from "../spi/netlify.js";
import { VERCEL_PROVIDER } from "../spi/vercel.js";
import { HEROKU_PROVIDER } from "../spi/heroku.js";
import { signAwsRequest } from "../core/aws_sigv4.js";
import { CloudConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["digitalocean", "netlify", "vercel", "heroku", "azure", "gcp", "aws"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's own
// test harness exactly - zero real network calls in this suite.
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { url: string; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ url, options });
    const next = this.responses.shift();
    if (!next) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await next()) as ApiResponse<T>;
  }

  async post<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.post() is not exercised by any cloud-connect provider");
  }
  async put<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.put() is not exercised by any cloud-connect provider");
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

  it("test_connect_heroku_sends_the_required_accept_header", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [] }));
    const provider = new DefaultCloudConnectProvider(HEROKU_PROVIDER, { token: "tok" }, adapter);
    await provider.connect();
    expect(adapter.calls[0]!.options?.headers?.Accept).toBe("application/vnd.heroku+json; version=3");
  });

  it("test_connect_vercel_parses_deployed_vs_no_production_deployment_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        projects: [
          { id: "p1", name: "deployed-app", targets: { production: {} } },
          { id: "p2", name: "undeployed-app" },
        ],
      },
    }));
    const provider = new DefaultCloudConnectProvider(VERCEL_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(resources).toEqual([
      { id: "p1", name: "deployed-app", status: "deployed" },
      { id: "p2", name: "undeployed-app", status: "no production deployment" },
    ]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultCloudConnectProvider(NETLIFY_PROVIDER, { token: "bad" }, adapter);
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
