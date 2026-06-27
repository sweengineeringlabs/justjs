import { describe, it, expect } from "bun:test"
import { exhaust }               from "../core/exhaust.js"

describe("exhaust()", () => {
  it("test_exhaust_with_unhandled_value_throws", () => {
    expect(() => exhaust("unhandled" as never)).toThrow()
  })

  it("test_exhaust_with_string_value_includes_value_in_message", () => {
    let msg = ""
    try { exhaust("x" as never) } catch (e) { msg = (e as Error).message }
    expect(msg).toContain("x")
  })

  it("test_exhaust_in_switch_default_with_exhausted_union_passes_type_check", () => {
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
