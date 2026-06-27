import { describe, it, expect } from "bun:test"
import { some, none }           from "../core/option.js"

describe("some()", () => {
  it("test_some_has_some_true", () => {
    expect(some(42).some).toBe(true)
  })

  it("test_some_carries_value", () => {
    expect(some("text").value).toBe("text")
  })

  it("test_some_with_zero_is_truthy", () => {
    const opt = some(0)
    expect(opt.some).toBe(true)
    expect(opt.value).toBe(0)
  })

  it("test_some_with_empty_string", () => {
    const opt = some("")
    expect(opt.some).toBe(true)
    expect(opt.value).toBe("")
  })

  it("test_some_value_accessible_after_narrowing", () => {
    const opt = some<number>(99)
    if (opt.some) {
      expect(opt.value).toBe(99)
    } else {
      throw new Error("Should not reach none branch")
    }
  })
})

describe("none()", () => {
  it("test_none_has_some_false", () => {
    expect(none().some).toBe(false)
  })

  it("test_none_value_is_undefined", () => {
    expect(none().value).toBeUndefined()
  })

  it("test_some_and_none_have_same_shape_for_v8_monomorphism", () => {
    const present = some(1)
    const absent  = none()
    expect(Object.keys(present).sort()).toEqual(Object.keys(absent).sort())
  })
})
