import { signal as preactSignal, computed, effect } from "@preact/signals-core"
import type { Signal as PreactSignal }              from "@preact/signals-core"
import type { Signal, WritableSignal }              from "../api/store.js"

class ReadonlySignalImpl<T> implements Signal<T> {
  protected readonly _inner: PreactSignal<T>

  constructor(inner: PreactSignal<T>) {
    this._inner = inner
  }

  get value(): T {
    return this._inner.value as T
  }

  subscribe(fn: (value: T) => void): () => void {
    return effect(() => { fn(this._inner.value as T) })
  }
}

class WritableSignalImpl<T> extends ReadonlySignalImpl<T> implements WritableSignal<T> {
  set(value: T): void {
    this._inner.value = value
  }

  update(fn: (current: T) => T): void {
    this._inner.value = fn(this._inner.value as T)
  }
}

export function createSignal<T>(initial: T): WritableSignal<T> {
  return new WritableSignalImpl(preactSignal(initial))
}

export function createComputedSignal<T>(fn: () => T): Signal<T> {
  return new ReadonlySignalImpl(computed(fn))
}
