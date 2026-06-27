import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { SecurityProviderConfig }     from "../api/provider.js"
import { NoopSecurityContext }             from "../api/provider.js"

class DefaultSecurityAspect implements JustJSAspect {
  readonly concern  = "security" as const
  readonly strategy = "noop" as const

  context() { return new NoopSecurityContext() }

  weave(_target: AspectTarget): void {}
}

export class DefaultSecurityProvider {
  readonly concern  = "security" as const
  readonly strategy = "noop" as const

  factory(_config?: SecurityProviderConfig): DefaultSecurityAspect {
    return new DefaultSecurityAspect()
  }
}
