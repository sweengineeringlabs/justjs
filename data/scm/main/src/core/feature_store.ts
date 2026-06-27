import type { FeatureStore, Signal, Action } from "../api/store.js"
import { createSignal } from "./signal.js"

export class DefaultFeatureStore<T, Selector extends (state: T) => unknown>
  implements FeatureStore<T, Selector>
{
  readonly #state: ReturnType<typeof createSignal<T>>

  constructor(initial: T) {
    this.#state = createSignal(initial)
  }

  select<V>(selector: Selector): Signal<V> {
    const parent = this.#state
    return {
      get value() { return (selector as (s: T) => V)(parent.value) },
      subscribe(fn: (value: V) => void): () => void {
        let prev = (selector as (s: T) => V)(parent.value)
        return parent.subscribe((s) => {
          const next = (selector as (s: T) => V)(s)
          if (next !== prev) { prev = next; fn(next) }
        })
      }
    }
  }

  async dispatch(action: Action): Promise<void> {
    void action
    // Reducer wiring — consumers extend and override
  }

  snapshot(): T {
    return this.#state.value
  }
}
