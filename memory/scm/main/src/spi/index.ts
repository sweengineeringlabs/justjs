import { justjs } from "@justjs/application";
import { DefaultMemoryProvider } from "../core/default_memory_provider.js";
import type { MemoryProviderConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "memory",
  strategy: "dummy",
  factory: (config?: MemoryProviderConfig) => new DefaultMemoryProvider(config),
});
