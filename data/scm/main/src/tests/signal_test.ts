import { describe, it, expect } from "bun:test"
import { createSignal, createComputedSignal } from "../core/signal.js"

describe("createSignal", () => {
  it("test_signal_has_initial_value", () => {
    const s = createSignal(42)
    expect(s.value).toBe(42)
  })

  it("test_signal_set_updates_value", () => {
    const s = createSignal(0)
    s.set(99)
    expect(s.value).toBe(99)
  })

  it("test_signal_update_applies_fn", () => {
    const s = createSignal(5)
    s.update(n => n * 2)
    expect(s.value).toBe(10)
  })

  it("test_signal_subscribe_fires_on_change", () => {
    const s = createSignal(0)
    const received: number[] = []
    s.subscribe(v => received.push(v))
    s.set(1)
    s.set(2)
    expect(received).toContain(1)
    expect(received).toContain(2)
  })
})

describe("createComputedSignal", () => {
  it("test_computed_reflects_source_signal", () => {
    const s      = createSignal(3)
    const doubled = createComputedSignal(() => s.value * 2)
    expect(doubled.value).toBe(6)
    s.set(5)
    expect(doubled.value).toBe(10)
  })
})
