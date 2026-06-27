import { justjs } from "@justjs/application"
import { DefaultI18nProvider } from "../core/default_i18n.js"

const provider = new DefaultI18nProvider()
justjs.providers.register({ concern: "i18n", strategy: "noop", factory: (config?: unknown) => provider.factory(config) })
