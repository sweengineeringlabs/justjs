import { justjs } from "@justjs/application"
import { DefaultSecurityProvider } from "../core/default_security.js"

const provider = new DefaultSecurityProvider()

justjs.providers.register({
  concern: "security",
  strategy: "noop",
  factory: (config?: any) => provider.factory(config),
})
