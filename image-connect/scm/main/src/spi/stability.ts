import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { StabilityImageConnectProvider } from "../core/stability_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "imageConnect",
  strategy: "stability",
  factory: (config?: BearerTokenConfig) =>
    new StabilityImageConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
