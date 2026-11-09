import { justjs } from "@justjs/application"
import { DefaultObservabilityProvider } from "../core/default_observability.js"
import type { ObservabilityProviderConfig } from "../api/api_provider.js"

const provider = new DefaultObservabilityProvider()
justjs.providers.register({ concern: "observability", strategy: "noop", factory: (config?: ObservabilityProviderConfig) => provider.factory(config) })
