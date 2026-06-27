import { justjs } from "@justjs/application"
import { DefaultThemingProvider } from "../core/default_theming.js"
import type { ThemingProviderConfig } from "../api/api_provider.js"

const provider = new DefaultThemingProvider()
justjs.providers.register({ concern: "theming", strategy: "noop", factory: (config?: ThemingProviderConfig) => provider.factory(config) })
