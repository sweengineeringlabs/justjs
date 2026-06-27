import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { AnalyticsProviderConfig } from "../api/provider.js"
import { NoopUIAnalyticsContext } from "../api/provider.js"

class DefaultAnalyticsAspect implements JustJSAspect {
  readonly concern = "analytics" as const
  readonly strategy = "noop" as const

  context() { return new NoopUIAnalyticsContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultAnalyticsProvider {
  readonly concern = "analytics" as const
  readonly strategy = "noop" as const
  factory(_config?: AnalyticsProviderConfig): DefaultAnalyticsAspect { return new DefaultAnalyticsAspect() }
}
