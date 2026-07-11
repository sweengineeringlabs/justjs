export type { MemoryRecord, MemoryKind, MemorySource } from "../api/record.js";
export type {
  MemoryProvider,
  MemoryProviderConfig,
  MemoryQuery,
  MemoryQueryResult,
  MemoryWriteInput,
  ConsolidationResult,
} from "../api/provider.js";
export { MemoryProviderError } from "../api/provider.js";

// Pure function, not a Default* class - fine to export directly
// (core_not_exported_directly only restricts implementation classes).
export { computeFakeEmbedding, cosineSimilarity } from "../core/fake_embedding.js";

// justjs#91 fix, applied here rather than repeated: importing this
// module's own spi/index.js for its side effect means the common case
// (`import { createMemoryProvider } from "@justjs/memory"`) genuinely
// self-registers the "dummy" strategy - unlike the six aop-* packages,
// where a bare import of the main entry point never reaches their
// spi/index.ts at all (that module isn't in their exports map, and
// saf/index.ts doesn't import it either). This package's package.json
// also exports "./spi" directly, for a consumer that wants the
// side-effect-only import without pulling in the rest of the surface.
import "../spi/index.js";

import type { MemoryProvider, MemoryProviderConfig } from "../api/provider.js";
import { DefaultMemoryProvider } from "../core/default_memory_provider.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// MemoryProvider contract, never the concrete Default* class name.
export function createMemoryProvider(config?: MemoryProviderConfig): MemoryProvider {
  return new DefaultMemoryProvider(config);
}
