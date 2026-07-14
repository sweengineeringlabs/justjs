export type { ImageConnectProvider, GeneratedImage, BearerTokenConfig } from "../api/provider.js";
export { ImageConnectProviderError } from "../api/provider.js";

// Same justjs#91-pattern fix every sibling *-connect package's own
// saf/index.ts applies - importing this module's own spi/index.ts for
// its side effect means a bare `import { createImageConnectProvider }
// from "@justjs/image-connect"` genuinely self-registers all 3
// strategies.
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { ImageConnectProvider, BearerTokenConfig } from "../api/provider.js";
import { ImageConnectProviderError } from "../api/provider.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// same rule every sibling *-connect package's saf/index.ts follows) -
// callers depend on the ImageConnectProvider contract, never a
// concrete provider class name.
export function createImageConnectProvider(strategy: string, config: BearerTokenConfig): ImageConnectProvider {
  const spec = justjs.providers.resolve("imageConnect", strategy);
  if (!spec) {
    throw new ImageConnectProviderError("UNKNOWN_STRATEGY", `@justjs/image-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as ImageConnectProvider;
}
