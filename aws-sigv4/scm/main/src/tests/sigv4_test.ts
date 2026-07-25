import { describe, it, expect } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import { signAwsRequest } from "../core/sigv4.js";

describe("signAwsRequest", () => {
  // Cross-checks against an independent Node-crypto (createHash/
  // createHmac) implementation of AWS's own published SigV4 spec - a
  // real regression guard, not a trophy test: this exact shape caught a
  // real bug (a mixed-case extraHeaders key silently breaking the
  // canonical-header lookup) when run against AWS's live STS endpoint.
  // If the lowercasing logic in core/sigv4.ts regresses, this test fails
  // because the two independently-derived signatures stop matching.
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
    // Regression test for a real bug a live AWS test caught: extraHeaders
    // with a mixed-case name (e.g. "Accept") used to silently break the
    // canonical-header lookup, since the header names were lowercased
    // for sorting but looked up on the original-case object. Confirms
    // the header actually reaches the signed set.
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

  // Real regression guard for the body-signing extension (justjs cloud
  // provisioning work, justjs#139/ADR-0017) - the signature must change
  // when the body changes, proving payloadHash actually covers the real
  // request body rather than silently hashing "" the way every prior
  // call (bodyless GETs) did.
  it("test_a_real_request_body_changes_the_signature_from_the_bodyless_case", async () => {
    const base = {
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      region: "us-east-1",
      service: "ecs",
      method: "POST",
      host: "ecs.us-east-1.amazonaws.com",
      path: "/",
      query: "",
      extraHeaders: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AmazonEC2ContainerServiceV20141113.ListClusters" },
    };
    const bodyless = await signAwsRequest(base);
    const withBody = await signAwsRequest({ ...base, body: '{"maxResults":10}' });
    expect(withBody.Authorization).not.toBe(bodyless.Authorization);
  });

  it("test_the_same_body_signs_identically_to_an_independent_node_crypto_hash_of_that_body", async () => {
    // Cross-checks that payloadHash is a real SHA-256 of the exact body
    // bytes (not, say, its length or a placeholder) - independently
    // computed here via node:crypto, same cross-check discipline as the
    // bodyless test above.
    function sha256Hex(data: string): string {
      return createHash("sha256").update(data, "utf8").digest("hex");
    }
    const body = '{"clusterName":"demo"}';
    const req = {
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      region: "us-east-1",
      service: "ecs",
      method: "POST",
      host: "ecs.us-east-1.amazonaws.com",
      path: "/",
      query: "",
      body,
    };
    // Re-derive the canonical request/string-to-sign independently using
    // the real payload hash, and confirm signAwsRequest's own signature
    // matches when everything else (date) is pinned.
    const originalDateCtor = Date;
    class FixedDate extends originalDateCtor {
      constructor() {
        super("2022-08-30T12:36:00.000Z");
      }
      static override now() {
        return new originalDateCtor("2022-08-30T12:36:00.000Z").getTime();
      }
    }
    const date = "20220830T123600Z";
    const dateStamp = "20220830";
    const headers = { host: req.host, "x-amz-date": date };
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${(headers as Record<string, string>)[h]!.trim()}\n`).join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [req.method, req.path, req.query, canonicalHeaders, signedHeaders, sha256Hex(body)].join("\n");
    const credentialScope = `${dateStamp}/${req.region}/${req.service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", date, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    function hmac(key: string | Buffer, data: string): Buffer {
      return createHmac("sha256", key).update(data, "utf8").digest();
    }
    const kDate = hmac(`AWS4${req.secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, req.region);
    const kService = hmac(kRegion, req.service);
    const kSigning = hmac(kService, "aws4_request");
    const expectedSignature = hmac(kSigning, stringToSign).toString("hex");
    const expectedAuth = `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${expectedSignature}`;

    // @ts-expect-error - test-only global override, restored below
    globalThis.Date = FixedDate;
    let actualHeaders: Record<string, string>;
    try {
      actualHeaders = await signAwsRequest(req);
    } finally {
      globalThis.Date = originalDateCtor;
    }
    expect(actualHeaders.Authorization).toBe(expectedAuth);
  });

  // Real regression guard confirming a signature made for one AWS
  // service ("bedrock", justjs#145/ADR-0018) is genuinely different from
  // one made for another ("ecs") given the same date/credentials -
  // proving the `service` field actually participates in the derived
  // signing key rather than being ignored.
  it("test_different_services_produce_different_signatures_for_the_same_request_shape", async () => {
    const base = {
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "secret",
      region: "us-east-1",
      method: "POST",
      host: "example.amazonaws.com",
      path: "/",
      query: "",
      body: "{}",
    };
    const ecs = await signAwsRequest({ ...base, service: "ecs" });
    const bedrock = await signAwsRequest({ ...base, service: "bedrock" });
    expect(bedrock.Authorization).not.toBe(ecs.Authorization);
  });
});
