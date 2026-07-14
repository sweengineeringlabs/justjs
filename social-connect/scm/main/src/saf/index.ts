export type { SocialConnectProvider, SocialResource, BearerTokenConfig, AppPasswordConfig, ClientCredentialsConfig, SocialConnectProviderConfig } from "../api/provider.js";
export { SocialConnectProviderError } from "../api/provider.js";

// Same justjs#91-pattern fix @justjs/ai-assist's/@justjs/cloud-connect's/
// @justjs/scm-connect's/@justjs/comms-connect's own saf/index.ts applies -
// importing this module's own spi/index.ts for its side effect means a
// bare `import { createSocialConnectProvider } from "@justjs/social-connect"`
// genuinely self-registers all 3 strategies.
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { SocialConnectProvider, SocialConnectProviderConfig } from "../api/provider.js";
import { SocialConnectProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly) -
// callers depend on the SocialConnectProvider contract, never a
// concrete provider class name. Resolves through the same
// justjs.providers registry spi/ already populated - same corrected
// pattern @justjs/cloud-connect's/@justjs/scm-connect's/
// @justjs/comms-connect's own saf/index.ts uses.
export function createSocialConnectProvider(strategy: string, config: SocialConnectProviderConfig): SocialConnectProvider {
  const spec = justjs.providers.resolve("socialConnect", strategy);
  if (!spec) {
    throw new SocialConnectProviderError("UNKNOWN_STRATEGY", `@justjs/social-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as SocialConnectProvider;
}
