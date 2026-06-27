import { describe, it, expect } from "bun:test"
import { DefaultFeatureStore } from "../core/feature_store.js"

interface AppState {
  count: number
}

type AppAction = { type: "increment" } | { type: "decrement" }

describe("feature store", () => {
  it("test_store_initial_state", () => {
    const store = new DefaultFeatureStore<AppState>({ count: 0 })

    expect(store.state.value).toEqual({ count: 0 })
  })

  it("test_dispatch_with_reducer", () => {
    const store = new DefaultFeatureStore<AppState, AppAction>(
      { count: 0 },
      (state, action) => {
        if (action.type === "increment") {
          return { count: state.count + 1 }
        }
        return state
      }
    )

    store.dispatch({ type: "increment" })

    expect(store.state.value.count).toBe(1)
  })

  it("test_subscribe_to_changes", () => {
    const store = new DefaultFeatureStore<AppState, AppAction>(
      { count: 0 },
      (state, action) => {
        if (action.type === "increment") {
          return { count: state.count + 1 }
        }
        return state
      }
    )

    const changes: AppState[] = []
    store.subscribe((state) => {
      changes.push(state)
    })

    store.dispatch({ type: "increment" })
    store.dispatch({ type: "increment" })

    expect(changes).toHaveLength(2)
    expect(changes[0]!.count).toBe(1)
    expect(changes[1]!.count).toBe(2)
  })

  it("test_unsubscribe", () => {
    const store = new DefaultFeatureStore<AppState, AppAction>(
      { count: 0 },
      (state, action) => {
        if (action.type === "increment") {
          return { count: state.count + 1 }
        }
        return state
      }
    )

    let count = 0
    const unsubscribe = store.subscribe(() => {
      count++
    })

    store.dispatch({ type: "increment" })
    expect(count).toBe(1)

    unsubscribe()
    store.dispatch({ type: "increment" })
    expect(count).toBe(1)
  })
})
