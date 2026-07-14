// Thin app-local adapter over the real @justjs/scm-connect package -
// same role core/cloud_connect.ts plays for @justjs/cloud-connect.
import { createScmConnectProvider } from "@justjs/scm-connect";
import type { ScmResource } from "@justjs/scm-connect";

export type { ScmResource };

export function connectGithub(token: string): Promise<ScmResource[]> {
  return createScmConnectProvider("github", { token }).connect();
}

export function connectGitlab(token: string): Promise<ScmResource[]> {
  return createScmConnectProvider("gitlab", { token }).connect();
}

// Only the first workspace's repos are returned - Bitbucket's API has
// no single cross-workspace repo-list endpoint (confirmed via search),
// unlike GitHub/GitLab. See @justjs/scm-connect's BitbucketScmConnectProvider.
export function connectBitbucket(token: string): Promise<ScmResource[]> {
  return createScmConnectProvider("bitbucket", { token }).connect();
}
