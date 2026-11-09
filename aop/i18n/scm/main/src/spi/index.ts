import { justjs } from "@justjs/application"
import { DefaultI18nProvider } from "../core/default_i18n.js"
import type { I18nProviderConfig } from "../api/api_provider.js"

const provider = new DefaultI18nProvider()
justjs.providers.register({ concern: "i18n", strategy: "noop", factory: (config?: I18nProviderConfig) => provider.factory(config) })
