export interface Signal<T> {
  readonly value: T
}

export interface WritableSignal<T> extends Signal<T> {
  value: T
}

export interface FeatureStore<S = unknown, A = unknown> {
  readonly state: Signal<S>
  dispatch(action: A): void
  subscribe(listener: (state: S) => void): () => void
}

export interface UIEventBus {
  emit(event: string, data?: unknown): void
  on(event: string, listener: (data?: unknown) => void): () => void
}

export class DataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DataError"
  }
}
