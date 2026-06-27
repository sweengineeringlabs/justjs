import type { FeatureStore, WritableSignal } from "../api/signal.js"
import { createSignal } from "./signal.js"

export class DefaultFeatureStore<S = unknown, A = unknown> implements FeatureStore<S, A> {
  private stateSignal: WritableSignal<S>
  private subscribers = new Set<(state: S) => void>()

  constructor(
    initialState: S,
    private reducer?: (state: S, action: A) => S
  ) {
    this.stateSignal = createSignal(initialState)
  }

  get state(): WritableSignal<S> {
    return this.stateSignal
  }

  dispatch(action: A): void {
    if (this.reducer) {
      this.stateSignal.value = this.reducer(this.stateSignal.value, action)
      this.subscribers.forEach((listener) => listener(this.stateSignal.value))
    }
  }

  subscribe(listener: (state: S) => void): () => void {
    this.subscribers.add(listener)
    return () => {
      this.subscribers.delete(listener)
    }
  }
}
