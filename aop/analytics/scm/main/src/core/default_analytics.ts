import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { AnalyticsProviderConfig } from "../api/api_provider.js"
import { NoopAnalyticsContext } from "../api/api_provider.js"

class DefaultAnalyticsAspect implements JustJSAspect {
  readonly concern = "analytics" as const
  readonly strategy = "noop" as const

  context() { return new NoopAnalyticsContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultAnalyticsProvider {
  readonly concern = "analytics" as const
  readonly strategy = "noop" as const
  factory(_config?: AnalyticsProviderConfig): DefaultAnalyticsAspect { return new DefaultAnalyticsAspect() }
}
