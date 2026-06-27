import { describe, it, expect } from "bun:test"
import { DefaultUIEventBus } from "../core/event_bus.js"

const event = (type: string) => ({ type, componentId: "c1", occurredAt: 0 })

describe("DefaultUIEventBus", () => {
  it("test_subscribe_receives_published_event", () => {
    const bus = new DefaultUIEventBus()
    const received: string[] = []
    bus.subscribe("click", e => received.push(e.type))
    bus.publish(event("click"))
    expect(received).toEqual(["click"])
  })

  it("test_unsubscribe_stops_receiving_events", () => {
    const bus = new DefaultUIEventBus()
    const received: string[] = []
    const unsub = bus.subscribe("click", e => received.push(e.type))
    unsub()
    bus.publish(event("click"))
    expect(received).toHaveLength(0)
  })

  it("test_subscribe_does_not_receive_other_type", () => {
    const bus = new DefaultUIEventBus()
    const received: string[] = []
    bus.subscribe("hover", e => received.push(e.type))
    bus.publish(event("click"))
    expect(received).toHaveLength(0)
  })
})
