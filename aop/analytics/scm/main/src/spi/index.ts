import { justjs } from "@justjs/application"
import { DefaultAnalyticsProvider } from "../core/default_analytics.js"

const provider = new DefaultAnalyticsProvider()
justjs.providers.register({ concern: "analytics", strategy: "noop", factory: (config?: unknown) => provider.factory(config) })
