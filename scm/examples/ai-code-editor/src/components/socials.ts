// Real, official brand marks (CC0, offline - no runtime network call,
// same posture as workspace.ts/communication.ts) via simple-icons for
// Mastodon/Bluesky/Reddit/X - all 4 are in simple-icons' catalog for
// real. LinkedIn is NOT (confirmed - same real gap AWS/Azure/Heroku hit
// in workspace.ts's CLOUD_PROVIDER_CATALOG), so it falls back to a
// plain colored monogram instead of a fabricated logo shape.
import mastodonLogo from "simple-icons/icons/mastodon.svg?raw";
import blueskyLogo from "simple-icons/icons/bluesky.svg?raw";
import redditLogo from "simple-icons/icons/reddit.svg?raw";
import xLogo from "simple-icons/icons/x.svg?raw";
import {
  getStoredSocialToken,
  setStoredSocialToken,
  getStoredBlueskyCredentials,
  setStoredBlueskyCredentials,
  getStoredRedditCredentials,
  setStoredRedditCredentials,
} from "../core/socials_credentials.js";
import { connectMastodon, connectBluesky, connectReddit } from "../core/socials_connect.js";
import type { SocialResource } from "../core/socials_connect.js";
import "@justjs/component-view";
import type { NavHeaderView } from "@justjs/component-view";
import "@justjs/provider-connect";
import type { ProviderConnectorControl, ProviderCatalogItem } from "@justjs/provider-connect";

interface SocialProvider {
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
const SOCIAL_PROVIDER_CATALOG: readonly SocialProvider[] = [
  { id: "mastodon", name: "Mastodon", icon: "🐘", color: "#6364FF", logo: mastodonLogo, kind: "bearer" },
  { id: "bluesky", name: "Bluesky", icon: "🦋", color: "#1185FE", logo: blueskyLogo, kind: "apppassword" },
  { id: "reddit", name: "Reddit", icon: "👽", color: "#FF4500", logo: redditLogo, kind: "clientcreds" },
  { id: "x", name: "X (Twitter)", icon: "✕", color: "#000000", logo: xLogo, kind: "unsupported" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", color: "#0A66C2", kind: "unsupported" },
];

function isProviderConnected(p: SocialProvider): boolean {
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

const RESOURCE_LIST_LABELS: Record<string, string> = {
  bluesky: "Follows",
  reddit: "r/popular",
};

// <control-provider-connector> (@justjs/provider-connect) owns the
// grid/detail/connect/list orchestration from here on - this only maps
// each real provider to its property surface, computed once at mount.
function toCatalogItem(p: SocialProvider): ProviderCatalogItem {
  if (p.kind === "unsupported") {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      fields: [],
      unsupportedMessage: `⚠️ ${p.name}'s API did not return CORS headers when checked directly from a browser - connecting here isn't confirmed possible without a backend proxy, which this app doesn't have. Left as a local-list-only entry rather than a connect form that might silently fail.`,
    };
  }
  const base = {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    connected: isProviderConnected(p),
    resourceListLabel: RESOURCE_LIST_LABELS[p.id] ?? "Lists",
    ...(p.logo !== undefined ? { logo: p.logo } : {}),
  };
  if (p.kind === "apppassword") {
    return {
      ...base,
      fields: [
        { id: "identifier", type: "text", placeholder: "Bluesky handle or email" },
        { id: "appPassword", type: "password", placeholder: "App Password" },
      ],
      disclosure: `Stored only on this device. Sent directly to Bluesky when you connect. Use a real Bluesky "App Password" (Settings → App Passwords on bsky.app) - never your actual account password. Bluesky's own session token is short-lived, so this reconnects fresh every time rather than trying to cache it.`,
    };
  }
  if (p.kind === "clientcreds") {
    return {
      ...base,
      fields: [
        { id: "clientId", type: "text", placeholder: "Reddit client ID" },
        { id: "clientSecret", type: "password", placeholder: "Reddit client secret" },
      ],
      disclosure: `Stored only on this device. Sent directly to Reddit when you connect. Reddit's client_credentials grant is app-level only - it proves your credentials work against real public data (r/popular), it cannot list your own saved posts or subscriptions. Full personal access needs Reddit's OAuth consent flow, not attempted here.`,
    };
  }
  return {
    ...base,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
  };
}

// Real, actionable errors on empty fields (the same "Paste a token
// first."/"Enter both..." copy every prior round of this app already
// showed) stay here - <view-form> deliberately validates nothing
// beyond rendering, per ADR-0015's own scope.
async function handleConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<SocialResource[]> {
  const provider = SOCIAL_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (provider.kind === "apppassword") {
    const identifier = (values["identifier"] ?? "").trim() || getStoredBlueskyCredentials()?.identifier || "";
    const appPassword = (values["appPassword"] ?? "").trim() || getStoredBlueskyCredentials()?.appPassword || "";
    if (!identifier || !appPassword) {
      throw new Error("Enter both your handle/email and App Password.");
    }
    const resources = await connectBluesky(identifier, appPassword);
    setStoredBlueskyCredentials({ identifier, appPassword });
    return resources;
  }
  if (provider.kind === "clientcreds") {
    const clientId = (values["clientId"] ?? "").trim() || getStoredRedditCredentials()?.clientId || "";
    const clientSecret = (values["clientSecret"] ?? "").trim() || getStoredRedditCredentials()?.clientSecret || "";
    if (!clientId || !clientSecret) {
      throw new Error("Enter both the client ID and client secret.");
    }
    const resources = await connectReddit(clientId, clientSecret);
    setStoredRedditCredentials({ clientId, clientSecret });
    return resources;
  }
  const token = (values["token"] ?? "").trim() || getStoredSocialToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await connectMastodon(token);
  setStoredSocialToken(providerId, token);
  return resources;
}

function handleDisconnect(providerId: string): void {
  const provider = SOCIAL_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    return;
  }
  if (provider.kind === "apppassword") {
    setStoredBlueskyCredentials(null);
  } else if (provider.kind === "clientcreds") {
    setStoredRedditCredentials(null);
  } else {
    setStoredSocialToken(providerId, "");
  }
}

// Socials - the 7th top-level tab. Mounts once and never re-renders
// itself again - <control-provider-connector> owns every subsequent
// grid<->detail transition, connect/disconnect call, and resource-list
// render internally from here on.
export class SocialsElement extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `
      <view-nav-header id="socials-page-header"></view-nav-header>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual data. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
      <control-provider-connector id="socials-connector"></control-provider-connector>
    `;

    const header = this.querySelector<NavHeaderView>("#socials-page-header");
    if (header) {
      header.icon = "🌐";
      header.title = "Socials";
    }

    const connector = this.querySelector<ProviderConnectorControl>("#socials-connector");
    if (!connector) {
      return;
    }
    connector.catalogLabel = "Socials";
    connector.providers = SOCIAL_PROVIDER_CATALOG.map(toCatalogItem);
    connector.connect = handleConnect;
    connector.list = async (_providerId, session) => session as SocialResource[];
    connector.disconnect = handleDisconnect;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-socials")) {
  customElements.define("x-socials", SocialsElement);
}
