export interface LogDrain {
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, err?: Error, ctx?: Record<string, unknown>): void
}

export interface UIObserverContext {
  mark(name: string): void
  measure(name: string, startMark: string): void
  onError(fn: (err: Error) => void): () => void
  drain(): LogDrain
}
