import { githubLogo, gitlabLogo, bitbucketLogo } from "./brand_logos.js";
import { getStoredScmToken } from "./scm_credentials.js";

export interface ScmProvider {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly logo: string;
  // "deviceFlow" (GitHub only, justjs#135) signs in via GitHub's OAuth
  // Device Authorization Flow - no token to paste, no redirect URI
  // (works in the packaged Android WebView, unlike Jira's redirect-based
  // flow). GitLab/Bitbucket stay "bearer" - GitLab also supports device
  // flow but is a follow-up, not this pass; Bitbucket's OAuth is
  // redirect-only, out of scope for the same reason Jira's redirect flow
  // doesn't fit here.
  readonly kind: "bearer" | "deviceFlow";
}

// A real, recognizable set of actual source-control providers - all 3
// are in simple-icons' catalog for real, so no emoji-monogram fallback
// is needed here (unlike CLOUD_PROVIDER_CATALOG's AWS/Azure/Heroku
// gap). Extracted out of sdlc_hub.ts (justjs#139) - same reason
// core/socials_catalog.ts/core/comms_catalog.ts were previously
// extracted from their own components: a real, importable core-layer
// home for the catalog + connected-check, so Dashboard's own
// consolidation logic (core/scm_dashboard_analytics.ts) doesn't need to
// import from a component file.
export const SCM_PROVIDER_CATALOG: readonly ScmProvider[] = [
  { id: "github", name: "GitHub", color: "#181717", logo: githubLogo, kind: "deviceFlow" },
  { id: "gitlab", name: "GitLab", color: "#FC6D26", logo: gitlabLogo, kind: "bearer" },
  { id: "bitbucket", name: "Bitbucket", color: "#0052CC", logo: bitbucketLogo, kind: "bearer" },
];

export function isScmProviderConnected(p: ScmProvider): boolean {
  return getStoredScmToken(p.id).length > 0;
}
