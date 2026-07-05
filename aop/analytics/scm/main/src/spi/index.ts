import { justjs } from "@justjs/application"
import { DefaultAnalyticsProvider } from "../core/default_analytics.js"
import type { AnalyticsProviderConfig } from "../api/provider.js"

const provider = new DefaultAnalyticsProvider()
justjs.providers.register({ concern: "analytics", strategy: "noop", factory: (config?: AnalyticsProviderConfig) => provider.factory(config) })
