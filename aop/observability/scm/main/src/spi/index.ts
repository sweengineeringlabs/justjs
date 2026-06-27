import { JustJS }                       from "@justjs/application"
import { DefaultObservabilityProvider }  from "../core/default_observability.js"

const provider = new DefaultObservabilityProvider()

JustJS.providers.register(provider)
