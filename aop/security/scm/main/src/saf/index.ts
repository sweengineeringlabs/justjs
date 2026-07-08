export type { SecurityProviderConfig, SecurityAspect, SecurityProvider } from "../api/provider.js"
export { NoopSecurityContext }    from "../api/provider.js"

import type { SecurityProvider } from "../api/provider.js"
import { DefaultSecurityProvider } from "../core/default_security.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// SecurityProvider contract, never the concrete Default* class name.
export function createSecurityProvider(): SecurityProvider {
  return new DefaultSecurityProvider()
}
