import type { AspectProvider, JustJSAspect, UIObserverContext, LogDrain } from "@justjs/application"

export interface ObservabilityProviderConfig {
  endpoint?: string
  sampleRate?: number
}

export interface ObservabilityAspect extends JustJSAspect {
  readonly concern: "observability"
  context(): UIObserverContext
}

export interface ObservabilityProvider extends AspectProvider<ObservabilityProviderConfig> {
  readonly concern: "observability"
}

export class NoopLogDrain implements LogDrain {
  info(_msg: string,  _ctx?: Record<string, unknown>): void {}
  warn(_msg: string,  _ctx?: Record<string, unknown>): void {}
  error(_msg: string, _err?: Error, _ctx?: Record<string, unknown>): void {}
}

export class NoopObserverContext implements UIObserverContext {
  private readonly _drain = new NoopLogDrain()

  mark(_name: string): void {}
  measure(_name: string, _startMark: string): void {}
  onError(_fn: (err: Error) => void): () => void { return () => {} }
  drain(): LogDrain { return this._drain }
}
