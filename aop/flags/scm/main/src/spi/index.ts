import { justjs } from "@justjs/application"
import { DefaultFlagsProvider } from "../core/default_flags.js"
import type { FlagsProviderConfig } from "../api/provider.js"

const provider = new DefaultFlagsProvider()
justjs.providers.register({ concern: "flags", strategy: "noop", factory: (config?: FlagsProviderConfig) => provider.factory(config) })
