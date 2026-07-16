export type { UIThemingContext, ThemingProviderConfig, ThemingAspect, ThemingProvider } from "../api/provider.js"
export { NoopThemingContext } from "../api/provider.js"

// justjs#91 fix: importing this module's own spi/index.js for its side
// effect means the common case (`import { createThemingProvider } from
// "@justjs/aop-theming"`) genuinely self-registers the "noop" strategy,
// matching @justjs/memory's own saf/index.ts pattern.
import "../spi/index.js"

import type { ThemingProvider } from "../api/provider.js"
import { DefaultThemingProvider } from "../core/default_theming.js"
import { TokensThemingProvider } from "../core/tokens_theming.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ThemingProvider contract, never the concrete Default*/Tokens* class name.
export function createThemingProvider(): ThemingProvider {
  return new DefaultThemingProvider()
}

export function createTokensThemingProvider(): ThemingProvider {
  return new TokensThemingProvider()
}
