import { justjs } from "@justjs/application"
import { DefaultSecurityProvider } from "../core/default_security.js"
import type { SecurityProviderConfig } from "../api/api_provider.js"

const provider = new DefaultSecurityProvider()

justjs.providers.register({
  concern: "security",
  strategy: "noop",
  factory: (config?: SecurityProviderConfig) => provider.factory(config),
})
