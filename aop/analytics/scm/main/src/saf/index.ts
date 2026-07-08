export type { UIAnalyticsContext, AnalyticsProviderConfig, AnalyticsAspect, AnalyticsProvider } from "../api/provider.js"
export { NoopAnalyticsContext } from "../api/provider.js"

import type { AnalyticsProvider } from "../api/provider.js"
import { DefaultAnalyticsProvider } from "../core/default_analytics.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// AnalyticsProvider contract, never the concrete Default* class name.
export function createAnalyticsProvider(): AnalyticsProvider {
  return new DefaultAnalyticsProvider()
}
