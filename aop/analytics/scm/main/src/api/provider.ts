import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIAnalyticsContext {
  trackEvent(event: string, properties?: Record<string, unknown>): void
  trackPage(path: string, properties?: Record<string, unknown>): void
}

export interface AnalyticsProviderConfig {
  endpoint?: string
  batchSize?: number
}

export interface AnalyticsAspect extends JustJSAspect {
  readonly concern: "analytics"
  context(): UIAnalyticsContext
}

export interface AnalyticsProvider extends AspectProvider<AnalyticsProviderConfig> {
  readonly concern: "analytics"
}

export class NoopAnalyticsContext implements UIAnalyticsContext {
  trackEvent(): void {}
  trackPage(): void {}
}
