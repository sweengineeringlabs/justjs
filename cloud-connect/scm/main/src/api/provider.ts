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

// A single real file this app's own virtual filesystem (core/fs.ts)
// holds - always plain text, never binary/data-URL content.
export interface CloudDeployFile {
  readonly path: string;
  readonly content: string;
}

// The real, live URL a successful deploy resolves to, plus `targetId` -
// the provider's own real site/project/app identifier (Netlify's site
// id, Vercel's project name, Heroku's app id) a caller should persist
// and pass back into the next deploy() call as `existingTargetId`, so a
// second deploy updates the same live site/app instead of creating a
// new one every time - real "redeploy" semantics, matching how the
// Netlify/Vercel/Heroku CLIs themselves behave.
export interface CloudDeployResult {
  readonly url: string;
  readonly targetId: string;
}

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
  // Netlify/Vercel/Heroku-only, optional: pushes this app's own project
  // files to a real, live deployment on that provider - same
  // opt-in-after-a-successful-connect posture as listInstances().
  // `existingTargetId`, when passed, redeploys the same real
  // site/project/app a prior deploy() call returned as `targetId`
  // instead of creating a new one - callers should persist and reuse
  // it (see CloudDeployResult). Absent on every strategy that has no
  // real direct-file-upload deploy API (DigitalOcean/Azure/GCP/AWS -
  // see @justjs/cloud-connect's README for why each was excluded).
  deploy?(files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult>;
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
