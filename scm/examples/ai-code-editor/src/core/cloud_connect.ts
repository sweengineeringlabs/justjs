// Thin app-local adapter over the real @justjs/cloud-connect package -
// same role core/ai_assist.ts plays for @justjs/ai-assist. The actual
// HTTP requests, SigV4 signing, and response parsing all live in the
// real package now, not here; this file just adapts its
// createCloudConnectProvider(strategy, config) facade to the specific
// function names workspace.ts already calls.
import { createCloudConnectProvider } from "@justjs/cloud-connect";
import type { CloudResource, CloudDeployFile, CloudDeployResult } from "@justjs/cloud-connect";

export type { CloudResource, CloudDeployFile, CloudDeployResult };

export function connectDigitalOcean(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("digitalocean", { token }).connect();
}

export function connectNetlify(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("netlify", { token }).connect();
}

export function connectVercel(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("vercel", { token }).connect();
}

export function connectHeroku(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("heroku", { token }).connect();
}

// Token comes from `az account get-access-token --query accessToken -o tsv`
// (real ~60-90min expiry - see workspace.ts's connect form, which shows
// this exact command and the expiry to the user rather than hiding it).
export function connectAzure(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("azure", { token }).connect();
}

// Token comes from `gcloud auth print-access-token` (real ~1hr expiry -
// same "show the real command and expiry" treatment as Azure above).
export function connectGcp(token: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("gcp", { token }).connect();
}

export function connectAwsIdentity(accessKeyId: string, secretAccessKey: string): Promise<CloudResource[]> {
  return createCloudConnectProvider("aws", { accessKeyId, secretAccessKey }).connect();
}

// Separate, opt-in call (workspace.ts only offers this after a
// successful connectAwsIdentity) - needs the real ec2:DescribeInstances
// IAM permission, unlike GetCallerIdentity.
export function connectAwsInstances(accessKeyId: string, secretAccessKey: string): Promise<CloudResource[]> {
  const provider = createCloudConnectProvider("aws", { accessKeyId, secretAccessKey });
  // Real per api/provider.ts's CloudConnectProvider.listInstances comment -
  // only the "aws" strategy implements this, so it's always present here.
  return provider.listInstances!();
}

// Real "Deploy this project" - Netlify/Vercel/Heroku only (see
// api/provider.ts's CloudConnectProvider.deploy comment for why the
// other providers don't implement it). `existingTargetId`, when passed,
// redeploys the same real site/project/app a prior deploy() call
// returned as `targetId` instead of creating a new one every time - see
// workspace.ts's cloud_credentials.ts persistence.
export function deployToNetlify(token: string, files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
  return createCloudConnectProvider("netlify", { token }).deploy!(files, existingTargetId);
}

export function deployToVercel(token: string, files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
  return createCloudConnectProvider("vercel", { token }).deploy!(files, existingTargetId);
}

export function deployToHeroku(token: string, files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
  return createCloudConnectProvider("heroku", { token }).deploy!(files, existingTargetId);
}
