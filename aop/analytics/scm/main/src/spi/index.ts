import { JustJS }                   from "@justjs/application"
import { DefaultAnalyticsProvider }  from "../core/default_analytics.js"

const provider = new DefaultAnalyticsProvider()

JustJS.providers.register(provider)
