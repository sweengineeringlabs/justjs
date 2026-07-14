import type { AspectTarget } from "@justjs/application";

// A real resource/service returned by a provider's own real list API -
// never a placeholder. `status` is provider-specific vocabulary as-is
// (e.g. DigitalOcean's "active", Heroku's "released"/"not yet released")
// rather than normalized into a shared enum, since each provider's real
// status vocabulary means something different and normalizing would
// lose information without adding any.
export interface CloudResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

// The 6 non-AWS providers (DigitalOcean/Netlify/Vercel/Heroku/Azure/
// Google Cloud) all use a single bearer token - same shape, sent as
// `Authorization: Bearer <token>`.
export interface BearerTokenConfig {
  readonly token: string;
}

// AWS needs a real access-key-ID + secret-access-key pair and real
// SigV4 request signing (core/aws_sigv4.ts) - CORS support doesn't
// remove AWS's own signing requirement (confirmed against AWS's docs).
export interface AwsCredentialsConfig {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export type CloudConnectProviderConfig = BearerTokenConfig | AwsCredentialsConfig;

export interface CloudConnectProvider {
  readonly concern: "cloudConnect";
  readonly strategy: string;
  // Proves the credential/token actually works and returns the
  // account's real resources - DigitalOcean's droplets, Heroku's apps,
  // AWS's own verified identity (AWS's `aws` strategy calls STS
  // GetCallerIdentity here specifically because it needs zero IAM
  // permissions - the safest possible proof a key pair works).
  connect(): Promise<CloudResource[]>;
  // AWS-only, optional: DescribeInstances needs the real
  // ec2:DescribeInstances IAM permission, unlike connect()'s
  // GetCallerIdentity (which needs none) - callers offer this as a
  // separate, opt-in action only after connect() succeeds, never
  // automatically. Absent on every other strategy's implementation.
  listInstances?(): Promise<CloudResource[]>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - cloudConnect isn't
  // a rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as AiAssistProvider.weave().
  weave(target: AspectTarget): void;
}

export class CloudConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CloudConnectProviderError";
  }
}
