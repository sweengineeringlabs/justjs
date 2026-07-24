// Pure catalog data + a connected-status check, split out of
// components/socials.ts so agent_channels.ts/connect.ts can import it
// without depending on a file whose sole other job is registering the
// <x-socials> custom element.
import { mastodonLogo, blueskyLogo, redditLogo, xLogo } from "./brand_logos.js";
import { getStoredSocialToken, getStoredBlueskyCredentials, getStoredRedditCredentials } from "./socials_credentials.js";

export interface SocialProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  // "bearer" - Mastodon's single pasted token, sent as `Authorization:
  // Bearer`, same posture as ai_assist.ts's Anthropic key. "apppassword" -
  // Bluesky's real 2-field identifier + App Password (AT Protocol's own
  // real convention, never the account password) - see
  // core/bluesky_provider.ts for why nothing but these 2 fields is ever
  // persisted. "clientcreds" - Reddit's real 2-field client ID + secret,
  // exchanged for an app-level-only token (see the disclosure text
  // below) - real user-scoped access needs the full OAuth consent flow,
  // out of scope here. "unsupported" - X/Twitter's and LinkedIn's APIs
  // did not return CORS headers when checked live; connecting directly
  // from a browser isn't confirmed possible, so both stay an honest
  // "not available" state rather than a connect form that might
  // silently fail, same treatment Cloudflare already gets in
  // workspace.ts's CLOUD_PROVIDER_CATALOG.
  readonly kind: "bearer" | "apppassword" | "clientcreds" | "unsupported";
}

// A real, recognizable set of actual social providers - not a free-text
// "type any name" list. 3 of 5 are real, connectable providers with 3
// genuinely different auth shapes; X/Twitter and LinkedIn are shown
// honestly as not available rather than silently omitted.
export const SOCIAL_PROVIDER_CATALOG: readonly SocialProvider[] = [
  { id: "mastodon", name: "Mastodon", icon: "🐘", color: "#6364FF", logo: mastodonLogo, kind: "bearer" },
  { id: "bluesky", name: "Bluesky", icon: "🦋", color: "#1185FE", logo: blueskyLogo, kind: "apppassword" },
  { id: "reddit", name: "Reddit", icon: "👽", color: "#FF4500", logo: redditLogo, kind: "clientcreds" },
  { id: "x", name: "X (Twitter)", icon: "✕", color: "#000000", logo: xLogo, kind: "unsupported" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", color: "#0A66C2", kind: "unsupported" },
];

// Named distinctly (not isProviderConnected) - components/cartoon.ts has
// its own unrelated private method of that exact name, and justc's
// Android bundle genuinely collided the two (confirmed live on a real
// device: "ReferenceError: isProviderConnected is not defined" inside
// this module's own toCatalogItem(), even though the import is real and
// correct) - Vite's dev server and production build were both
// unaffected, so this is a justc-specific identifier-collision bug, not
// a JS logic error.
export function isSocialProviderConnected(p: SocialProvider): boolean {
  if (p.kind === "apppassword") {
    return getStoredBlueskyCredentials() !== null;
  }
  if (p.kind === "clientcreds") {
    return getStoredRedditCredentials() !== null;
  }
  if (p.kind === "unsupported") {
    return false;
  }
  return getStoredSocialToken(p.id).length > 0;
}
