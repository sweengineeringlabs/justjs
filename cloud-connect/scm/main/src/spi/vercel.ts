import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const VERCEL_PROVIDER: BearerProviderDescriptor = {
  strategy: "vercel",
  name: "Vercel",
  url: "https://api.vercel.com/v9/projects",
  parse: (data) =>
    (data as { projects: Array<{ id: string; name: string; targets?: Record<string, unknown> }> }).projects.map(
      (p) => ({ id: p.id, name: p.name, status: p.targets?.production ? "deployed" : "no production deployment" })
    ),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "vercel",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(VERCEL_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
