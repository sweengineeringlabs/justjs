import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const NETLIFY_PROVIDER: BearerProviderDescriptor = {
  strategy: "netlify",
  name: "Netlify",
  url: "https://api.netlify.com/api/v1/sites",
  parse: (data) =>
    (data as Array<{ id: string; name: string; state: string }>).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.state,
    })),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "netlify",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(NETLIFY_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
