import { describe, it, expect } from "bun:test"
import { newtype, unwrapNewtype } from "../core/newtype.js"
import type { Newtype }           from "../api/newtype.js"

type UserId    = Newtype<"UserId">
type ProductId = Newtype<"ProductId">
type Meters    = Newtype<"Meters", number>

describe("newtype()", () => {
  it("test_newtype_with_string_preserves_underlying_value", () => {
    const id = newtype<"UserId">("user-42")
    expect(id).toBe("user-42")
  })

  it("test_newtype_with_string_is_native_string_at_runtime", () => {
    const id = newtype<"UserId">("abc")
    expect(typeof id).toBe("string")
    expect(id.length).toBe(3)
  })

  it("test_newtype_with_number_base_preserves_arithmetic", () => {
    const m = newtype<"Meters", number>(100)
    expect(m).toBe(100)
    expect(m + 5).toBe(105)
  })
})

describe("unwrapNewtype()", () => {
  it("test_unwrap_newtype_with_string_newtype_returns_string", () => {
    const id: UserId = newtype<"UserId">("user-1")
    expect(unwrapNewtype(id)).toBe("user-1")
  })

  it("test_unwrap_newtype_with_number_newtype_returns_number", () => {
    const m: Meters = newtype<"Meters", number>(42)
    expect(unwrapNewtype<"Meters", number>(m)).toBe(42)
  })

  it("test_unwrap_newtype_with_distinct_brands_returns_same_value", () => {
    const uid: UserId    = newtype<"UserId">("same")
    const pid: ProductId = newtype<"ProductId">("same")
    expect(unwrapNewtype(uid)).toBe(unwrapNewtype(pid))
  })

  it("test_brand_blocks_structural_aliasing_at_compile_time", () => {
    const uid: UserId = newtype<"UserId">("user-1")
    // @ts-expect-error — UserId is not assignable to ProductId (different brands block structural aliasing)
    const _pid: ProductId = uid
    void _pid
    expect(true).toBe(true)
  })
})
