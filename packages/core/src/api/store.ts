export interface Signal<T> {
  readonly value: T
  subscribe(fn: (value: T) => void): () => void
}

export interface WritableSignal<T> extends Signal<T> {
  set(value: T): void
  update(fn: (current: T) => T): void
}

export interface FeatureStore<T, Selector> {
  select<V>(selector: Selector): Signal<V>
  dispatch(action: Action): Promise<void>
  snapshot(): T
}

export interface Action {
  readonly type: string
  readonly payload?: unknown
}

export interface UIEventBus {
  publish(event: UIEvent): void
  subscribe(type: string, fn: (event: UIEvent) => void): () => void
}

export interface UIEvent {
  readonly type:        string
  readonly componentId: string
  readonly payload?:    unknown
  readonly occurredAt:  number
}
