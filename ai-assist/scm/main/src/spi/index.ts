import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AnthropicAiAssistProvider } from "../core/anthropic_provider.js";
import type { AiAssistProviderConfig } from "../api/provider.js";

// Registered so justjs.providers.has("aiAssist", "anthropic")/
// strategiesFor() reflect reality, matching @justjs/memory's precedent.
// boot() now forwards aspects[concern].config to this factory (see
// AspectConfig.config, application/scm/main/src/core/boot.ts), so an app
// CAN list "aiAssist" in boot()'s `aspects` config for real, as long as
// it supplies `config: { apiKey: "..." }` - omitting it falls back to
// `{ apiKey: "" }` below, which still boots but produces a provider that
// fails on first real call rather than at boot time. Existing callers
// (e.g. scm/examples/ai-code-editor) build the singleton directly via
// createAiAssistProvider(config) in saf/index.ts instead, since the key
// there is loaded from localStorage after boot, not known at boot time.
justjs.providers.register({
  concern: "aiAssist",
  strategy: "anthropic",
  factory: (config?: AiAssistProviderConfig) =>
    new AnthropicAiAssistProvider(config ?? { apiKey: "" }, createApiAdapter(createFetchAdapter())),
});
