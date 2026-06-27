import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { FlagsProviderConfig }         from "../api/provider.js"
import { NoopFlagsContext }                 from "../api/provider.js"

class DefaultFlagsAspect implements JustJSAspect {
  readonly concern  = "flags" as const
  readonly strategy = "noop" as const

  context() { return new NoopFlagsContext() }

  weave(_target: AspectTarget): void {}
}

export class DefaultFlagsProvider {
  readonly concern  = "flags" as const
  readonly strategy = "noop" as const

  factory(_config?: FlagsProviderConfig): DefaultFlagsAspect {
    return new DefaultFlagsAspect()
  }
}
