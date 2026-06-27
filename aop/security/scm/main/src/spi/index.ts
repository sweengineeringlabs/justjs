import { JustJS }                  from "@justjs/application"
import { DefaultSecurityProvider }  from "../core/default_security.js"

const provider = new DefaultSecurityProvider()

JustJS.providers.register({
  concern: "security",
  strategy: "noop",
  factory: (config?: unknown) => provider.factory(config),
})
