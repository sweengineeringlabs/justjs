export type {
  AgentStepMessage,
  AgentStepRequest,
  AgentStepResult,
  AgentToolDefinition,
  AiAssistProvider,
  AiAssistProviderConfig,
  AnthropicAiAssistConfig,
  BedrockAiAssistConfig,
  ChatMessage,
  ChatRequest,
  CompletionRequest,
  DesignDocRequest,
  ImageAttachment,
  ReviewFinding,
  ReviewRequest,
  ReviewSeverity,
  ScaffoldedFile,
  ScaffoldProjectRequest,
  ScaffoldRequest,
  SlidesRequest,
} from "../api/provider.js";
export { AiAssistProviderError } from "../api/provider.js";

// justjs#91 fix, applied here rather than repeated (@justjs/memory's own
// saf/index.ts established this) - importing this module's own
// spi/index.ts for its side effect means a bare
// `import { createAiAssistProvider } from "@justjs/ai-assist"` genuinely
// self-registers every strategy ("anthropic", "bedrock").
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { AiAssistProvider, AiAssistProviderConfig } from "../api/provider.js";
import { AiAssistProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// AiAssistProvider contract, never a concrete provider class name.
// Resolves through the same justjs.providers registry spi/ already
// populated (the `import "../spi/index.js"` above guarantees every
// strategy is registered before this can be called) - this package
// previously hardcoded AnthropicAiAssistProvider here directly, bypassing
// its own SPI registration entirely (a real, pre-existing inconsistency
// with every other *-connect package's saf/index.ts); fixed as part of
// adding a second real strategy (justjs#145/ADR-0018), since a strategy
// registered but never actually resolvable is worse than not registering
// it at all.
export function createAiAssistProvider(strategy: string, config: AiAssistProviderConfig): AiAssistProvider {
  const spec = justjs.providers.resolve("aiAssist", strategy);
  if (!spec) {
    throw new AiAssistProviderError("UNKNOWN_STRATEGY", `@justjs/ai-assist: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as AiAssistProvider;
}
