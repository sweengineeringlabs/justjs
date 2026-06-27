import { justjs } from "@justjs/application"
import { DefaultObservabilityProvider } from "../core/default_observability.js"

const provider = new DefaultObservabilityProvider()
justjs.providers.register({ concern: "observability", strategy: "noop", factory: (config?: any) => provider.factory(config) })
