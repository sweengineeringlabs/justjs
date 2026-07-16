import { justjs } from "@justjs/application"
import { DefaultSecurityProvider } from "../core/default_security.js"
import { BearerSecurityProvider } from "../core/bearer_security.js"
import type { SecurityProviderConfig } from "../api/provider.js"

const provider = new DefaultSecurityProvider()

justjs.providers.register({
  concern: "security",
  strategy: "noop",
  factory: (config?: SecurityProviderConfig) => provider.factory(config),
})

const bearerProvider = new BearerSecurityProvider()

justjs.providers.register({
  concern: "security",
  strategy: "bearer",
  factory: (config?: SecurityProviderConfig) => bearerProvider.factory(config),
})
