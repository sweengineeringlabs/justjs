import { JustJS }               from "@justjs/application"
import { DefaultFlagsProvider }  from "../core/default_flags.js"

const provider = new DefaultFlagsProvider()

JustJS.providers.register(provider)
