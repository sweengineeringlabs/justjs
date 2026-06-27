import { JustJS }                  from "@justjs/application"
import { DefaultThemingProvider }   from "../core/default_theming.js"

const provider = new DefaultThemingProvider()

JustJS.providers.register(provider)
