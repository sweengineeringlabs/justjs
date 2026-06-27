import { describe, it, expect } from "bun:test"
import { exhaust }               from "../core/exhaust.js"

describe("exhaust()", () => {
  it("test_exhaust_throws_on_unexpected_value", () => {
    expect(() => exhaust("unhandled" as never)).toThrow()
  })

  it("test_exhaust_message_includes_the_value", () => {
    let msg = ""
    try { exhaust("x" as never) } catch (e) { msg = (e as Error).message }
    expect(msg).toContain("x")
  })

  it("test_exhaust_used_in_switch_default_catches_unreachable_arm", () => {
    type Coin = "heads" | "tails"
    function describe(c: Coin): string {
      switch (c) {
        case "heads": return "heads"
        case "tails": return "tails"
        default:      return exhaust(c)
      }
    }
    expect(describe("heads")).toBe("heads")
    expect(describe("tails")).toBe("tails")
  })
})
