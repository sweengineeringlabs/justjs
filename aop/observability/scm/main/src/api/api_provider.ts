import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIObserverContext {
  logEvent(event: string, data?: Record<string, unknown>): void
  logError(error: Error): void
  recordTiming(label: string, ms: number): void
}

export interface ObservabilityProviderConfig {
  endpoint?: string
  batchSize?: number
}

export interface ObservabilityAspect extends JustJSAspect {
  readonly concern: "observability"
  context(): UIObserverContext
}

export interface ObservabilityProvider extends AspectProvider<ObservabilityProviderConfig> {
  readonly concern: "observability"
}

export class NoopObserverContext implements UIObserverContext {
  logEvent(): void {}
  logError(): void {}
  recordTiming(): void {}
}
