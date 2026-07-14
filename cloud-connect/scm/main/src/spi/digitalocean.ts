import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const DIGITALOCEAN_PROVIDER: BearerProviderDescriptor = {
  strategy: "digitalocean",
  name: "DigitalOcean",
  url: "https://api.digitalocean.com/v2/droplets",
  parse: (data) =>
    (data as { droplets: Array<{ id: number; name: string; status: string }> }).droplets.map((d) => ({
      id: String(d.id),
      name: d.name,
      status: d.status,
    })),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "digitalocean",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
