// Thin app-local adapter over the real @justjs/social-connect package -
// same role core/cloud_connect.ts/core/scm_connect.ts/core/comms_connect.ts
// play for their own packages.
import { createSocialConnectProvider } from "@justjs/social-connect";
import type { SocialResource } from "@justjs/social-connect";

export type { SocialResource };

export function connectMastodon(token: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("mastodon", { token }).connect();
}

// Bluesky's own real 2-step session exchange (identifier + real "App
// Password", never the account password) lives inside
// @justjs/social-connect, not here - see its core/bluesky_provider.ts.
export function connectBluesky(identifier: string, appPassword: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("bluesky", { identifier, appPassword }).connect();
}

// Reddit's real OAuth2 client_credentials exchange (app-level access
// only, a real disclosed limitation - see workspace/socials UI copy)
// lives inside @justjs/social-connect, not here.
export function connectReddit(clientId: string, clientSecret: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("reddit", { clientId, clientSecret }).connect();
}
