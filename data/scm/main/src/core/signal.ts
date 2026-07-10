// Not aliased (`import { signal as preactSignal }`) - justscript_compiler#15:
// justc 0.3.4's iife/cjs bundler inlines an aliased import from an external
// (node_modules) package under its *original* exported name while leaving
// call sites referencing the local alias unchanged, producing a real
// ReferenceError at runtime. An unaliased import bundles correctly.
import { signal } from "@preact/signals-core"
import type { Signal, WritableSignal } from "../api/signal.js"

export function createSignal<T>(initialValue: T): WritableSignal<T> {
  return signal(initialValue) as WritableSignal<T>
}

export function createReadonlySignal<T>(initialValue: T): Signal<T> {
  return signal(initialValue) as Signal<T>
}
