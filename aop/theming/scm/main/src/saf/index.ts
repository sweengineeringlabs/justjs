export type { UIThemingContext, ThemingProviderConfig, ThemingAspect, ThemingProvider } from "../api/provider.js"
export { NoopThemingContext } from "../api/provider.js"

import type { ThemingProvider } from "../api/provider.js"
import { DefaultThemingProvider } from "../core/default_theming.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ThemingProvider contract, never the concrete Default* class name.
export function createThemingProvider(): ThemingProvider {
  return new DefaultThemingProvider()
}
