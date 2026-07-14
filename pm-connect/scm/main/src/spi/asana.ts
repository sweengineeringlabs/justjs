import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AsanaPmConnectProvider } from "../core/asana_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "pmConnect",
  strategy: "asana",
  factory: (config?: BearerTokenConfig) =>
    new AsanaPmConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
