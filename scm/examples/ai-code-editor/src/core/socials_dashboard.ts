// Real consolidated view across all connected Socials providers
// (justjs#137) - merges each connected provider's own real connect()
// result (SocialResource[]) into one list, tagged by source, rather
// than making the user open Mastodon/Bluesky/Reddit separately to see
// each one's data. Dependency-injected (mirrors
// components/agent_comms_tools.ts's already-proven shape) so the real
// merge/error-isolation logic is unit-testable without real
// localStorage/network.
import { SOCIAL_PROVIDER_CATALOG } from "./socials_catalog.js";
import { getStoredSocialToken, getStoredBlueskyCredentials, getStoredRedditCredentials } from "./socials_credentials.js";
import { connectMastodon, connectBluesky, connectReddit } from "./socials_connect.js";
import type { SocialResource } from "./socials_connect.js";

export interface SocialsDashboardEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly resource: SocialResource;
}

export interface SocialsDashboardError {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface SocialsDashboardResult {
  readonly entries: readonly SocialsDashboardEntry[];
  readonly errors: readonly SocialsDashboardError[];
}

export interface SocialsDashboardDeps {
  readonly resolveSocialToken: (providerId: string) => string;
  readonly resolveBlueskyCredentials: () => { readonly identifier: string; readonly appPassword: string } | null;
  readonly resolveRedditCredentials: () => { readonly clientId: string; readonly clientSecret: string } | null;
  readonly connectMastodon: (token: string) => Promise<SocialResource[]>;
  readonly connectBluesky: (identifier: string, appPassword: string) => Promise<SocialResource[]>;
  readonly connectReddit: (clientId: string, clientSecret: string) => Promise<SocialResource[]>;
}

const REAL_DEPS: SocialsDashboardDeps = {
  resolveSocialToken: getStoredSocialToken,
  resolveBlueskyCredentials: getStoredBlueskyCredentials,
  resolveRedditCredentials: getStoredRedditCredentials,
  connectMastodon,
  connectBluesky,
  connectReddit,
};

// "Connected" is derived from these same injected resolvers (not the
// separate isSocialProviderConnected() from socials_catalog.ts, which
// reads real localStorage directly) - a real bug caught while testing
// this file: the earlier version called the real check regardless of
// `deps`, so fake credentials never made a test provider "connected".
function isConnected(deps: SocialsDashboardDeps, p: (typeof SOCIAL_PROVIDER_CATALOG)[number]): boolean {
  if (p.kind === "apppassword") {
    return deps.resolveBlueskyCredentials() !== null;
  }
  if (p.kind === "clientcreds") {
    return deps.resolveRedditCredentials() !== null;
  }
  if (p.kind === "unsupported") {
    return false;
  }
  return deps.resolveSocialToken(p.id).length > 0;
}

export async function fetchSocialsDashboard(deps: SocialsDashboardDeps = REAL_DEPS): Promise<SocialsDashboardResult> {
  const connectedProviders = SOCIAL_PROVIDER_CATALOG.filter((p) => isConnected(deps, p));

  const settled = await Promise.allSettled(
    connectedProviders.map(async (p) => {
      if (p.kind === "apppassword") {
        const credentials = deps.resolveBlueskyCredentials();
        if (!credentials) {
          throw new Error("Bluesky credentials missing.");
        }
        return deps.connectBluesky(credentials.identifier, credentials.appPassword);
      }
      if (p.kind === "clientcreds") {
        const credentials = deps.resolveRedditCredentials();
        if (!credentials) {
          throw new Error("Reddit credentials missing.");
        }
        return deps.connectReddit(credentials.clientId, credentials.clientSecret);
      }
      return deps.connectMastodon(deps.resolveSocialToken(p.id));
    })
  );

  const entries: SocialsDashboardEntry[] = [];
  const errors: SocialsDashboardError[] = [];
  settled.forEach((result, i) => {
    const p = connectedProviders[i]!;
    if (result.status === "fulfilled") {
      entries.push(...result.value.map((resource) => ({ providerId: p.id, providerName: p.name, providerIcon: p.icon, resource })));
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ providerId: p.id, providerName: p.name, message });
    }
  });

  return { entries, errors };
}
