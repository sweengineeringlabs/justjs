// Real AWS Signature Version 4 request signing, implemented against
// AWS's own published spec (docs.aws.amazon.com/IAM/latest/UserGuide/
// reference_sigv-create-signed-request.html) using only the Web Crypto
// API - no AWS SDK dependency. AWS's own CORS documentation is explicit
// that enabling CORS on an API (confirmed live for EC2/STS) does not
// remove the signing requirement - every request still needs a valid
// SigV4 Authorization header, regardless of origin.
//
// Consumers of this package (browser apps with no backend) sign here,
// client-side, using credentials the user provides directly. AWS's own
// guidance (IAM best practices, "Beyond IAM access keys" security blog)
// is that long-term access keys are a real risk and temporary/
// short-lived credentials are preferred - callers (e.g. the connect UI
// in an app using this package) should surface that to the user, not
// just here.
//
// Structurally verified, not just trusted: cross-checked against an
// independent Node-crypto (createHash/createHmac) implementation of
// this same spec (byte-for-byte identical signature on a fixed input),
// and against a real signed request to AWS's live STS endpoint - which
// is what caught a real bug (a mixed-case extraHeaders key silently
// breaking the canonical-header lookup, see the comment inline below)
// that the synthetic cross-check alone did not exercise. See
// src/tests/cloud_connect_int_test.ts for the permanent regression test.

export interface AwsSigningRequest {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly service: string;
  readonly method: string;
  readonly host: string;
  readonly path: string;
  // Already-encoded query string, e.g. "Action=GetCallerIdentity&Version=2011-06-15" -
  // AWS's canonical form requires params sorted by key; callers pass them
  // pre-sorted since every call this package makes only ever has 1-2 fixed params.
  readonly query: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return toHex(digest);
}

async function hmacSha256(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function amzDate(): { amzDate: string; dateStamp: string } {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

// Returns the headers to attach to the real fetch() call - Authorization,
// X-Amz-Date, and Host (callers should also send these exact values, not
// re-derive them, or the signature won't match what's on the wire).
export async function signAwsRequest(req: AwsSigningRequest): Promise<Record<string, string>> {
  const { amzDate: date, dateStamp } = amzDate();
  const payloadHash = await sha256Hex(""); // every call this package makes is a bodyless GET

  // Keyed by lowercase header name from the start - AWS's canonical
  // form requires lowercase names, and looking a lowercased name back
  // up against an original-case object (e.g. a caller's "Accept" vs.
  // the lowercased "accept") silently returns undefined otherwise, a
  // real bug this exact shape caught live against AWS's own server
  // (extraHeaders is the only mixed-case source - "host"/"x-amz-date"
  // above are already lowercase).
  const headers: Record<string, string> = { host: req.host, "x-amz-date": date };
  for (const [name, value] of Object.entries(req.extraHeaders ?? {})) {
    headers[name.toLowerCase()] = value;
  }
  const signedHeaderNames = Object.keys(headers).sort();
  // Non-null: h always comes from Object.keys(headers) directly above,
  // so headers[h] is always defined - noUncheckedIndexedAccess can't
  // prove that statically for a dynamically-derived key.
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]!.trim()}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");

  const canonicalRequest = [
    req.method,
    req.path || "/",
    req.query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${req.region}/${req.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    date,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${req.secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, req.region);
  const kService = await hmacSha256(kRegion, req.service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = toHex(await hmacSha256(kSigning, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${req.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...(req.extraHeaders ?? {}),
    Host: req.host,
    "X-Amz-Date": date,
    Authorization: authorization,
  };
}
