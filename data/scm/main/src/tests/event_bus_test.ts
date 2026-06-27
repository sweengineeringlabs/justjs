import { describe, it, expect } from "bun:test"
import { DefaultUIEventBus } from "../core/event_bus.js"

describe("event bus", () => {
  it("test_emit_and_on_basic", () => {
    const bus = new DefaultUIEventBus()
    let received: unknown

    bus.on("test", (data) => {
      received = data
    })

    bus.emit("test", "hello")

    expect(received).toBe("hello")
  })

  it("test_multiple_listeners", () => {
    const bus = new DefaultUIEventBus()
    const results: unknown[] = []

    bus.on("test", (data) => results.push(data))
    bus.on("test", (data) => results.push(data))

    bus.emit("test", "data")

    expect(results).toHaveLength(2)
    expect(results[0]).toBe("data")
    expect(results[1]).toBe("data")
  })

  it("test_unsubscribe", () => {
    const bus = new DefaultUIEventBus()
    let count = 0

    const unsubscribe = bus.on("test", () => {
      count++
    })

    bus.emit("test")
    expect(count).toBe(1)

    unsubscribe()
    bus.emit("test")
    expect(count).toBe(1)
  })

  it("test_emit_without_listeners", () => {
    const bus = new DefaultUIEventBus()

    expect(() => {
      bus.emit("nonexistent", "data")
    }).not.toThrow()
  })
})
