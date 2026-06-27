import { justjs } from "@justjs/application"
import { DefaultThemingProvider } from "../core/default_theming.js"

const provider = new DefaultThemingProvider()
justjs.providers.register({ concern: "theming", strategy: "noop", factory: (config?: unknown) => provider.factory(config) })
