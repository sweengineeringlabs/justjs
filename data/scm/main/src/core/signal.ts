import { signal as preactSignal } from "@preact/signals-core"
import type { Signal, WritableSignal } from "../api/signal.js"

export function createSignal<T>(initialValue: T): WritableSignal<T> {
  return preactSignal(initialValue) as WritableSignal<T>
}

export function createReadonlySignal<T>(initialValue: T): Signal<T> {
  return preactSignal(initialValue) as Signal<T>
}
