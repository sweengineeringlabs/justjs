export type { CommsConnectProvider, CommsResource, BearerTokenConfig } from "../api/provider.js";
export { CommsConnectProviderError } from "../api/provider.js";

// Same justjs#91-pattern fix @justjs/ai-assist's/@justjs/cloud-connect's/
// @justjs/scm-connect's own saf/index.ts applies - importing this
// module's own spi/index.ts for its side effect means a bare
// `import { createCommsConnectProvider } from "@justjs/comms-connect"`
// genuinely self-registers all 3 strategies.
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { CommsConnectProvider, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly) -
// callers depend on the CommsConnectProvider contract, never a concrete
// provider class name. Resolves through the same justjs.providers
// registry spi/ already populated - same corrected pattern
// @justjs/cloud-connect's/@justjs/scm-connect's own saf/index.ts uses.
export function createCommsConnectProvider(strategy: string, config: BearerTokenConfig): CommsConnectProvider {
  const spec = justjs.providers.resolve("commsConnect", strategy);
  if (!spec) {
    throw new CommsConnectProviderError("UNKNOWN_STRATEGY", `@justjs/comms-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as CommsConnectProvider;
}
