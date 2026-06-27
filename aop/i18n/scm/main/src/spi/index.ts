import { JustJS }              from "@justjs/application"
import { DefaultI18nProvider }  from "../core/default_i18n.js"

const provider = new DefaultI18nProvider()

JustJS.providers.register(provider)
