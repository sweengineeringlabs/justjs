export type { ScmConnectProvider, ScmResource, BearerTokenConfig } from "../api/provider.js";
export { ScmConnectProviderError } from "../api/provider.js";
// Plain exported functions, not a registered `justjs.providers` strategy -
// they don't implement the ScmConnectProvider contract themselves, only
// produce the token that later gets passed into createScmConnectProvider
// ("github", {token}). Same precedent as @justjs/pm-connect's
// buildJiraAuthorizationUrl/exchangeJiraAuthorizationCode.
export type { GithubDeviceCodeConfig, GithubDeviceCodeSession } from "../core/github_device_flow.js";
export { requestGithubDeviceCode, pollGithubDeviceToken } from "../core/github_device_flow.js";

// Same justjs#91-pattern fix @justjs/ai-assist's/@justjs/cloud-connect's
// own saf/index.ts applies - importing this module's own spi/index.ts
// for its side effect means a bare `import { createScmConnectProvider }
// from "@justjs/scm-connect"` genuinely self-registers all 3 strategies.
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { ScmConnectProvider, BearerTokenConfig } from "../api/provider.js";
import { ScmConnectProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly) -
// callers depend on the ScmConnectProvider contract, never a concrete
// provider class name. Resolves through the same justjs.providers
// registry spi/ already populated (the `import "../spi/index.js"` above
// guarantees every strategy is registered before this can be called)
// rather than duplicating each provider's config/lookup here - same
// corrected pattern @justjs/cloud-connect's own saf/index.ts uses.
export function createScmConnectProvider(strategy: string, config: BearerTokenConfig): ScmConnectProvider {
  const spec = justjs.providers.resolve("scmConnect", strategy);
  if (!spec) {
    throw new ScmConnectProviderError("UNKNOWN_STRATEGY", `@justjs/scm-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as ScmConnectProvider;
}
