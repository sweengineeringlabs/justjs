// Thin app-local adapter over the real @justjs/social-connect package -
// same role core/cloud_connect.ts/core/scm_connect.ts/core/comms_connect.ts
// play for their own packages.
import { createSocialConnectProvider } from "@justjs/social-connect";
import type { SocialResource } from "@justjs/social-connect";

export type { SocialResource };

export function connectMastodon(token: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("mastodon", { token }).connect();
}

// Real POST /api/v1/statuses - see @justjs/social-connect's
// DefaultSocialConnectProvider.createPost()/MASTODON_PROVIDER descriptor.
export function postMastodonStatus(token: string, text: string): Promise<void> {
  return createSocialConnectProvider("mastodon", { token }).createPost!(text);
}

// Bluesky's own real 2-step session exchange (identifier + real "App
// Password", never the account password) lives inside
// @justjs/social-connect, not here - see its core/bluesky_provider.ts.
export function connectBluesky(identifier: string, appPassword: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("bluesky", { identifier, appPassword }).connect();
}

// Real com.atproto.repo.createRecord (app.bsky.feed.post) - re-
// authenticates fresh via Bluesky's short-lived session, same as
// connect() - see @justjs/social-connect's BlueskySocialConnectProvider.
export function postBlueskyPost(identifier: string, appPassword: string, text: string): Promise<void> {
  return createSocialConnectProvider("bluesky", { identifier, appPassword }).createPost!(text);
}

// Reddit's real OAuth2 client_credentials exchange (app-level access
// only, a real disclosed limitation - see workspace/socials UI copy)
// lives inside @justjs/social-connect, not here.
export function connectReddit(clientId: string, clientSecret: string): Promise<SocialResource[]> {
  return createSocialConnectProvider("reddit", { clientId, clientSecret }).connect();
}
