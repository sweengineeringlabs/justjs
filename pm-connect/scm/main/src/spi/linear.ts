import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { LinearPmConnectProvider } from "../core/linear_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "pmConnect",
  strategy: "linear",
  factory: (config?: BearerTokenConfig) =>
    new LinearPmConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
