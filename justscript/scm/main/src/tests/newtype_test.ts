import { describe, it, expect } from "bun:test"
import { newtype }               from "../core/control.js"
import type { Newtype }          from "../api/newtype.js"

type UserId   = Newtype<string, "UserId">
type ProductId = Newtype<string, "ProductId">

describe("newtype()", () => {
  it("test_newtype_carries_underlying_value", () => {
    const id = newtype<UserId>("user-42")
    expect(id).toBe("user-42")
  })

  it("test_newtype_is_transparent_at_runtime", () => {
    const id = newtype<UserId>("abc")
    expect(typeof id).toBe("string")
    expect(id.length).toBe(3)
  })

  it("test_newtype_with_number_base", () => {
    type Meters = Newtype<number, "Meters">
    const m = newtype<Meters>(100)
    expect(m).toBe(100)
    expect(m + 5).toBe(105)
  })

  it("test_newtype_distinct_brands_produce_same_runtime_value", () => {
    const uid = newtype<UserId>("same-string")
    const pid = newtype<ProductId>("same-string")
    expect((uid as string)).toBe(pid as string)
  })
})
