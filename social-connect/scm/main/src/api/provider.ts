import type { AspectTarget } from "@justjs/application";

// A real followed-account/post/list returned by a provider's own real
// list API. `status` is provider-specific vocabulary as-is (Mastodon's
// list replies-policy, Reddit's subreddit, Bluesky's handle) - kept
// identical in shape to @justjs/cloud-connect's CloudResource /
// @justjs/scm-connect's ScmResource / @justjs/comms-connect's
// CommsResource on purpose, so a consuming app's UI markup/CSS can be
// shared across all four concerns.
export interface SocialResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

// Mastodon is the one real provider using a single bearer-shaped token
// (a real app-registered access token), sent as `Authorization: Bearer`.
export interface BearerTokenConfig {
  readonly token: string;
}

// Bluesky (AT Protocol) needs a real identifier (handle or email) plus
// a real "App Password" (not the account password itself, and not a
// static bearer token) - connect() exchanges these for a short-lived
// session on every call, see core/bluesky_provider.ts.
export interface AppPasswordConfig {
  readonly identifier: string;
  readonly appPassword: string;
}

// Reddit needs a real registered app's client ID + secret, exchanged
// via OAuth2 client_credentials for an app-only access token - see
// core/reddit_provider.ts for the real, disclosed app-level-only
// limitation this grant type carries.
export interface ClientCredentialsConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export type SocialConnectProviderConfig = BearerTokenConfig | AppPasswordConfig | ClientCredentialsConfig;

export interface SocialConnectProvider {
  readonly concern: "socialConnect";
  readonly strategy: string;
  // Proves the credential actually works and returns a real, provider-
  // specific resource list (Mastodon's lists, Bluesky's follows,
  // Reddit's public r/popular/hot posts).
  connect(): Promise<SocialResource[]>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - socialConnect isn't
  // a rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as CloudConnectProvider.weave()/
  // ScmConnectProvider.weave()/CommsConnectProvider.weave().
  weave(target: AspectTarget): void;
}

export class SocialConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "SocialConnectProviderError";
  }
}
