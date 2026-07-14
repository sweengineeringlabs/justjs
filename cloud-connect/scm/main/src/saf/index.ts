export type {
  CloudConnectProvider,
  CloudResource,
  BearerTokenConfig,
  AwsCredentialsConfig,
  CloudConnectProviderConfig,
  CloudDeployFile,
  CloudDeployResult,
} from "../api/provider.js";
export { CloudConnectProviderError } from "../api/provider.js";

// Same justjs#91-pattern fix @justjs/ai-assist's own saf/index.ts
// applies - importing this module's own spi/index.ts for its side
// effect means a bare `import { createCloudConnectProvider } from
// "@justjs/cloud-connect"` genuinely self-registers all 7 strategies,
// unlike the six aop-* packages (whose spi/index.ts is dead code - no
// "./spi" exports subpath, never imported from saf/index.ts).
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { CloudConnectProvider, CloudConnectProviderConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// same rule @justjs/ai-assist's saf/index.ts follows) - callers depend
// on the CloudConnectProvider contract, never a concrete provider class
// name. Resolves through the same justjs.providers registry spi/
// already populated (the `import "../spi/index.js"` above guarantees
// every strategy is registered before this can be called) rather than
// duplicating each provider's config/lookup here - core/spi already
// know how to build each strategy, this just asks the registry for it.
export function createCloudConnectProvider(strategy: string, config: CloudConnectProviderConfig): CloudConnectProvider {
  const spec = justjs.providers.resolve("cloudConnect", strategy);
  if (!spec) {
    throw new CloudConnectProviderError("UNKNOWN_STRATEGY", `@justjs/cloud-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as CloudConnectProvider;
}
