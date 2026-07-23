export type {
  AgentStepMessage,
  AgentStepRequest,
  AgentStepResult,
  AgentToolDefinition,
  AiAssistProvider,
  AiAssistProviderConfig,
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
// self-registers the "anthropic" strategy, unlike the six aop-* packages.
import "../spi/index.js";

import type { AiAssistProvider, AiAssistProviderConfig } from "../api/provider.js";
import { AnthropicAiAssistProvider } from "../core/anthropic_provider.js";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// AiAssistProvider contract, never the concrete Anthropic* class name.
// config is required (not optional, unlike createMemoryProvider) since
// AiAssistProviderConfig.apiKey has no meaningful default.
export function createAiAssistProvider(config: AiAssistProviderConfig): AiAssistProvider {
  return new AnthropicAiAssistProvider(config, createApiAdapter(createFetchAdapter()));
}
