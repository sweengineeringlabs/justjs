import { justjs } from "@justjs/application"
import { DefaultThemingProvider } from "../core/default_theming.js"
import { TokensThemingProvider } from "../core/tokens_theming.js"
import type { ThemingProviderConfig } from "../api/provider.js"

const provider = new DefaultThemingProvider()
justjs.providers.register({ concern: "theming", strategy: "noop", factory: (config?: ThemingProviderConfig) => provider.factory(config) })

const tokensProvider = new TokensThemingProvider()
justjs.providers.register({ concern: "theming", strategy: "tokens", factory: (config?: ThemingProviderConfig) => tokensProvider.factory(config) })
