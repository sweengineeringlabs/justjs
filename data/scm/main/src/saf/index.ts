export type {
  Signal,
  WritableSignal,
  FeatureStore,
  UIEventBus,
} from "../api/signal.js"
export { DataError } from "../api/signal.js"

export { createSignal, createReadonlySignal } from "../core/signal.js"

import type { FeatureStore, UIEventBus } from "../api/signal.js"
import { DefaultUIEventBus } from "../core/event_bus.js"
import { DefaultFeatureStore } from "../core/feature_store.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// FeatureStore/UIEventBus contract, never the concrete Default* class name.
export function createUIEventBus(): UIEventBus {
  return new DefaultUIEventBus()
}

export function createFeatureStore<S, A>(
  initialState: S,
  reducer?: (state: S, action: A) => S
): FeatureStore<S, A> {
  return new DefaultFeatureStore<S, A>(initialState, reducer)
}
