import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { ObservabilityProviderConfig } from "../api/provider.js"
import { NoopUIObserverContext } from "../api/provider.js"

class DefaultObservabilityAspect implements JustJSAspect {
  readonly concern = "observability" as const
  readonly strategy = "noop" as const

  context() { return new NoopUIObserverContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultObservabilityProvider {
  readonly concern = "observability" as const
  readonly strategy = "noop" as const
  factory(_config?: ObservabilityProviderConfig): DefaultObservabilityAspect { return new DefaultObservabilityAspect() }
}
