export type { SecurityProviderConfig, SecurityAspect, SecurityProvider, UISecurityContext, Principal } from "../api/provider.js"
export { NoopSecurityContext }    from "../api/provider.js"

// justjs#91 fix: importing this module's own spi/index.js for its side
// effect means the common case (`import { createSecurityProvider } from
// "@justjs/aop-security"`) genuinely self-registers the "noop" strategy,
// matching @justjs/memory's own saf/index.ts pattern.
import "../spi/index.js"

import type { SecurityProvider } from "../api/provider.js"
import { DefaultSecurityProvider } from "../core/default_security.js"
import { BearerSecurityProvider, createBearerApiAdapter } from "../core/bearer_security.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// SecurityProvider contract, never the concrete Default*/Bearer* class name.
export function createSecurityProvider(): SecurityProvider {
  return new DefaultSecurityProvider()
}

export function createBearerSecurityProvider(): SecurityProvider {
  return new BearerSecurityProvider()
}

export { createBearerApiAdapter }
