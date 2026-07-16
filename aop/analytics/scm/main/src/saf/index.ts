export type { UIAnalyticsContext, AnalyticsProviderConfig, AnalyticsAspect, AnalyticsProvider } from "../api/provider.js"
export { NoopAnalyticsContext } from "../api/provider.js"

// justjs#91 fix: importing this module's own spi/index.js for its side
// effect means the common case (`import { createAnalyticsProvider } from
// "@justjs/aop-analytics"`) genuinely self-registers the "noop" strategy,
// matching @justjs/memory's own saf/index.ts pattern.
import "../spi/index.js"

import type { AnalyticsProvider } from "../api/provider.js"
import { DefaultAnalyticsProvider } from "../core/default_analytics.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// AnalyticsProvider contract, never the concrete Default* class name.
export function createAnalyticsProvider(): AnalyticsProvider {
  return new DefaultAnalyticsProvider()
}
