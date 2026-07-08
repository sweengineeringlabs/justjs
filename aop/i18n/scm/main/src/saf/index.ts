export type { UIi18nContext, I18nProviderConfig, I18nAspect, I18nProvider } from "../api/provider.js"
export { NoopI18nContext } from "../api/provider.js"

import type { I18nProvider } from "../api/provider.js"
import { DefaultI18nProvider } from "../core/default_i18n.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// I18nProvider contract, never the concrete Default* class name.
export function createI18nProvider(): I18nProvider {
  return new DefaultI18nProvider()
}
