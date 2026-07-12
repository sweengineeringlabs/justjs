import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AnthropicAiAssistProvider } from "../core/anthropic_provider.js";
import type { AiAssistProviderConfig } from "../api/provider.js";

// Registered purely so justjs.providers.has("aiAssist", "anthropic")/
// strategiesFor() reflect reality, matching @justjs/memory's precedent -
// boot()'s weave loop only ever calls `spec.factory()` with ZERO
// arguments (application/scm/main/src/core/boot.ts, `spec.factory()` -
// no config forwarded from `aspects[concern]`), and AiAssistProviderConfig.apiKey
// is required, unlike MemoryProviderConfig's fully-optional shape. An app
// MUST NOT list "aiAssist" in boot()'s `aspects` config - doing so would
// call this factory with no apiKey and throw synchronously inside boot().
// The real, working singleton is always built directly via
// createAiAssistProvider(config) in saf/index.ts, with a real config.
justjs.providers.register({
  concern: "aiAssist",
  strategy: "anthropic",
  factory: (config?: AiAssistProviderConfig) =>
    new AnthropicAiAssistProvider(config ?? { apiKey: "" }, createApiAdapter(createFetchAdapter())),
});
