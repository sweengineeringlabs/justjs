import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultSocialConnectProvider } from "../core/default_social_connect_provider.js";
import type { SocialProviderDescriptor } from "../core/default_social_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// mastodon.social - a single, real, well-known instance (same
// single-region simplification precedent AWS's STS/EC2 calls already
// use in @justjs/cloud-connect), not a user-specified instance-host
// field. A real, app-registered access token, sent as
// `Authorization: Bearer` (confirmed live - a fake token returns a real
// 401 against this exact endpoint).
export const MASTODON_PROVIDER: SocialProviderDescriptor = {
  strategy: "mastodon",
  name: "Mastodon",
  url: "https://mastodon.social/api/v1/lists",
  parse: (data) =>
    (data as Array<{ id: string; title: string; replies_policy?: string }>).map((l) => ({
      id: l.id,
      name: l.title,
      status: l.replies_policy ?? "unknown",
    })),
};

justjs.providers.register({
  concern: "socialConnect",
  strategy: "mastodon",
  factory: (config?: BearerTokenConfig) =>
    new DefaultSocialConnectProvider(MASTODON_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
