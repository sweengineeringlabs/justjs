import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { GeminiImageConnectProvider } from "../core/gemini_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "imageConnect",
  strategy: "gemini",
  factory: (config?: BearerTokenConfig) =>
    new GeminiImageConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
