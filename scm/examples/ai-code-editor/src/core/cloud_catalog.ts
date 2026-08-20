import { gcpLogo, digitaloceanLogo, cloudflareLogo, vercelLogo, netlifyLogo } from "./brand_logos.js";
import { getStoredCloudToken, getStoredAwsCredentials } from "./cloud_credentials.js";

export interface CloudProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  // Each provider's real, recognizable brand color (not an arbitrary
  // palette pick) - used for the badge background regardless of
  // whether a real `logo` SVG is available.
  readonly color: string;
  // Raw SVG markup (simple-icons, single <path>, no fill set) for the
  // 5 providers actually in that catalog. Recolored to white via a
  // `fill="currentColor"` injection at render time (renderCloudProviders
  // in sdlc_hub.ts) so it reads clearly against its own colored badge.
  // Absent for aws/azure/heroku - those render their emoji `icon`
  // instead, not a fabricated logo.
  readonly logo?: string;
  // "bearer" - a single pasted token, sent as `Authorization: Bearer`,
  // same posture as ai_assist.ts's Anthropic key. "aws" - two fields
  // (access key ID + secret) and real SigV4 request signing
  // (core/aws_sigv4.ts) - AWS's own docs are explicit that CORS support
  // doesn't remove the signing requirement. "unsupported" - Cloudflare's
  // API did not return CORS headers when checked live; connecting
  // directly from a browser isn't confirmed possible, so this stays an
  // honest "not available" state rather than a connect form that might
  // silently fail.
  readonly kind: "bearer" | "aws" | "unsupported";
  // Real command the user runs locally to get a token - only Azure/GCP
  // need this (a short-lived CLI-issued token, not a full OAuth-in-SPA
  // flow - see cloud_connect.ts's comments for why). Shown verbatim in
  // the connect form, along with the token's real expiry.
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  // Netlify/Vercel/Heroku only: a real, direct-from-browser "Deploy this
  // project" action is available (@justjs/cloud-connect's own optional
  // deploy() capability) - orthogonal to `kind` (all 3 stay "bearer"),
  // same reasoning AWS's listInstances-only capability already
  // established: an extra opt-in action, not a new provider `kind`.
  readonly supportsDeploy?: boolean;
}

// A real, recognizable set of actual cloud providers - not arbitrary
// user-typed strings. Extracted out of sdlc_hub.ts (justjs#139) - same
// reason core/scm_catalog.ts/core/pm_catalog.ts were previously
// extracted: a real, importable core-layer home for the catalog +
// connected-check, so Dashboard's own consolidation logic
// (core/cloud_dashboard_analytics.ts) doesn't need to import from a
// component file.
export const CLOUD_PROVIDER_CATALOG: readonly CloudProvider[] = [
  { id: "aws", name: "AWS", icon: "🟧", color: "#FF9900", kind: "aws" },
  { id: "gcp", name: "Google Cloud", icon: "🔴", color: "#4285F4", logo: gcpLogo, kind: "bearer", tokenHint: { command: "gcloud auth print-access-token", expiry: "~1 hour" } },
  { id: "azure", name: "Microsoft Azure", icon: "🔷", color: "#0078D4", kind: "bearer", tokenHint: { command: "az account get-access-token --query accessToken -o tsv", expiry: "~60-90 minutes" } },
  { id: "digitalocean", name: "DigitalOcean", icon: "💧", color: "#0080FF", logo: digitaloceanLogo, kind: "bearer" },
  { id: "cloudflare", name: "Cloudflare", icon: "🟠", color: "#F38020", logo: cloudflareLogo, kind: "unsupported" },
  { id: "vercel", name: "Vercel", icon: "▲", color: "#000000", logo: vercelLogo, kind: "bearer", supportsDeploy: true },
  { id: "netlify", name: "Netlify", icon: "🟢", color: "#00C7B7", logo: netlifyLogo, kind: "bearer", supportsDeploy: true },
  { id: "heroku", name: "Heroku", icon: "🟣", color: "#430098", kind: "bearer", supportsDeploy: true },
];

export function isCloudProviderConnected(p: CloudProvider): boolean {
  return p.kind === "aws" ? getStoredAwsCredentials() !== null : getStoredCloudToken(p.id).length > 0;
}
