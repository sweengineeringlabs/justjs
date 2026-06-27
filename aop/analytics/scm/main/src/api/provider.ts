import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface AnalyticsEvent {
  readonly name:       string
  readonly properties: Record<string, unknown>
  readonly timestamp:  number
}

export interface AnalyticsContext {
  track(event: string, properties?: Record<string, unknown>): void
  page(name: string, properties?: Record<string, unknown>): void
  identify(userId: string, traits?: Record<string, unknown>): void
}

export interface AnalyticsProviderConfig {
  writeKey?: string
  endpoint?: string
}

export interface AnalyticsAspect extends JustJSAspect {
  readonly concern: "analytics"
  context(): AnalyticsContext
}

export interface AnalyticsProvider extends AspectProvider<AnalyticsProviderConfig> {
  readonly concern: "analytics"
}

export class NoopAnalyticsContext implements AnalyticsContext {
  track(_event: string, _properties?: Record<string, unknown>): void {}
  page(_name: string,   _properties?: Record<string, unknown>): void {}
  identify(_userId: string, _traits?: Record<string, unknown>): void {}
}
