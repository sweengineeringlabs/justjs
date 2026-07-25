// Shared AWS credential shape - any package making a real SigV4-signed
// AWS request needs exactly these two fields (access key ID + secret
// access key). Extracted here (justjs#145/ADR-0018) so @justjs/cloud-
// connect and @justjs/ai-assist both depend on one canonical definition
// instead of two independently-defined, potentially-drifting copies.
export interface AwsCredentialsConfig {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

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
  // Real request body for JSON-protocol (e.g. ECS: X-Amz-Target header,
  // JSON body) and REST-JSON (e.g. EKS: path-based, JSON body on POST/
  // PUT) calls - absent/"" for bodyless GETs (STS/EC2/CloudWatch's Query
  // API). The signature must cover the actual bytes sent on the wire, so
  // callers must pass the exact same string as the real fetch() body,
  // not reconstruct it separately.
  readonly body?: string;
}
