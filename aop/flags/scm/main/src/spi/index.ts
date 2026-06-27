import { justjs } from "@justjs/application"
import { DefaultFlagsProvider } from "../core/default_flags.js"

const provider = new DefaultFlagsProvider()
justjs.providers.register({ concern: "flags", strategy: "noop", factory: (config?: unknown) => provider.factory(config) })
