export type { UIi18nContext, I18nProviderConfig, I18nAspect, I18nProvider } from "../api/provider.js"
export { NoopI18nContext } from "../api/provider.js"

// justjs#91 fix: importing this module's own spi/index.js for its side
// effect means the common case (`import { createI18nProvider } from
// "@justjs/aop-i18n"`) genuinely self-registers the "noop" strategy,
// matching @justjs/memory's own saf/index.ts pattern.
import "../spi/index.js"

import type { I18nProvider } from "../api/provider.js"
import { DefaultI18nProvider } from "../core/default_i18n.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// I18nProvider contract, never the concrete Default* class name.
export function createI18nProvider(): I18nProvider {
  return new DefaultI18nProvider()
}
