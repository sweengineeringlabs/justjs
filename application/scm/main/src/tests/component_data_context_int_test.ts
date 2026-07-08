import { describe, it, expect } from "bun:test"
import { createFeatureStore, createUIEventBus } from "@justjs/data"
import type { Component, ComponentDataContext } from "../api/component.js"

// ADR-0003 D6: proves ComponentDataContext is genuinely usable with real
// @justjs/data types, not just structurally compiling against `unknown`.

describe("ComponentDataContext (ADR-0003 D6)", () => {
  it("test_component_reads_a_real_feature_store_via_the_third_render_argument", () => {
    const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
      { count: 0 },
      (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
    )

    let renderedCount: number | undefined
    const component: Component = {
      name: "counter",
      render(_props, _element, ctx?: ComponentDataContext) {
        renderedCount = (ctx?.store as typeof store | undefined)?.state.value.count
      },
    }

    store.dispatch({ type: "INCREMENT" })
    component.render({}, {} as Element, { store })

    expect(renderedCount).toBe(1)
  })

  it("test_component_emits_on_a_real_event_bus_via_the_third_render_argument", () => {
    const eventBus = createUIEventBus()
    const received: unknown[] = []
    eventBus.on("counter:rendered", (data) => received.push(data))

    const component: Component = {
      name: "counter",
      render(props, _element, ctx?: ComponentDataContext) {
        ctx?.eventBus?.emit("counter:rendered", props)
      },
    }

    component.render({ label: "hi" }, {} as Element, { eventBus })

    expect(received).toEqual([{ label: "hi" }])
  })

  it("test_component_ignoring_the_third_argument_still_satisfies_the_component_interface", () => {
    // The whole point of D6: additive, not breaking. A Component that never
    // reads ctx must still type-check and run unchanged.
    let rendered = false
    const component: Component = {
      name: "legacy",
      render() {
        rendered = true
      },
    }

    component.render({}, {} as Element, { store: createFeatureStore({}, (s) => s) })

    expect(rendered).toBe(true)
  })
})
