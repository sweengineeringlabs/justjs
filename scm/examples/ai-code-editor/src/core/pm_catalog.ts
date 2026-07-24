import { linearLogo, asanaLogo, trelloLogo, jiraLogo } from "./brand_logos.js";
import { getStoredPmToken, getStoredTrelloCredentials, getStoredJiraSession } from "./pm_credentials.js";

export interface PmProvider {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly logo: string;
  // "bearer" - Linear/Asana's single pasted token (Linear's own header
  // convention omits the "Bearer" prefix entirely - real, handled inside
  // @justjs/pm-connect, not a UI concern). "keytoken" - Trello's real
  // 2-field API key + token (sent as query params, not a header - also
  // handled inside the package). "oauth" - Jira's real OAuth 2.0
  // redirect flow.
  readonly kind: "bearer" | "keytoken" | "oauth";
}

// A real, recognizable set of actual project-management providers - all
// 4 are in simple-icons' catalog for real. Notion (confirmed no CORS
// support at all when checked live) isn't offered here even as an
// honest "not available" card - unlike Cloudflare/X/LinkedIn elsewhere,
// it was never in the confirmed provider set this feature shipped with.
// Extracted out of sdlc_hub.ts (justjs#139) - same reason
// core/scm_catalog.ts was previously extracted: a real, importable
// core-layer home for the catalog + connected-check, so Dashboard's own
// consolidation logic (core/pm_dashboard_analytics.ts) doesn't need to
// import from a component file.
export const PM_PROVIDER_CATALOG: readonly PmProvider[] = [
  { id: "linear", name: "Linear", color: "#5E6AD2", logo: linearLogo, kind: "bearer" },
  { id: "asana", name: "Asana", color: "#F06A6A", logo: asanaLogo, kind: "bearer" },
  { id: "trello", name: "Trello", color: "#0052CC", logo: trelloLogo, kind: "keytoken" },
  { id: "jira", name: "Jira", color: "#0052CC", logo: jiraLogo, kind: "oauth" },
];

// Dispatches on the provider's own credential shape - Linear/Asana use
// a single stored token, Trello a 2-field key/token pair, Jira an
// established OAuth session - same per-kind checks toPmCatalogItem()
// already made inline before this extraction.
export function isPmProviderConnected(p: PmProvider): boolean {
  if (p.kind === "oauth") {
    return getStoredJiraSession() !== null;
  }
  if (p.kind === "keytoken") {
    return getStoredTrelloCredentials() !== null;
  }
  return getStoredPmToken(p.id).length > 0;
}
