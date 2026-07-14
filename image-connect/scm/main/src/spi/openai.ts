import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { OpenAiImageConnectProvider } from "../core/openai_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "imageConnect",
  strategy: "openai",
  factory: (config?: BearerTokenConfig) =>
    new OpenAiImageConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
