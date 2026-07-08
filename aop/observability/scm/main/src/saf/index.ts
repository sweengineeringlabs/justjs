export type { UIObserverContext, ObservabilityProviderConfig, ObservabilityAspect, ObservabilityProvider } from "../api/provider.js"
export { NoopObserverContext } from "../api/provider.js"

import type { ObservabilityProvider } from "../api/provider.js"
import { DefaultObservabilityProvider } from "../core/default_observability.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ObservabilityProvider contract, never the concrete Default* class name.
export function createObservabilityProvider(): ObservabilityProvider {
  return new DefaultObservabilityProvider()
}
