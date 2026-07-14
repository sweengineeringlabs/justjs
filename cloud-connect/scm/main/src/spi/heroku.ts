import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const HEROKU_PROVIDER: BearerProviderDescriptor = {
  strategy: "heroku",
  name: "Heroku",
  url: "https://api.heroku.com/apps",
  extraHeaders: { Accept: "application/vnd.heroku+json; version=3" },
  parse: (data) =>
    (data as Array<{ id: string; name: string; released_at: string | null }>).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.released_at ? "released" : "not yet released",
    })),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "heroku",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(HEROKU_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
