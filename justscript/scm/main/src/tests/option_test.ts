import { describe, it, expect } from "bun:test"
import { some, none, fromNullable, toNullable } from "../core/option.js"

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
})

describe("none()", () => {
  it("test_none_has_some_false", () => {
    expect(none().some).toBe(false)
  })

  it("test_none_value_is_null", () => {
    expect(none().value).toBeNull()
  })

  it("test_none_returns_same_singleton", () => {
    expect(none()).toBe(none())
  })

  it("test_some_and_none_have_same_keys_for_v8_monomorphism", () => {
    expect(Object.keys(some(1)).sort()).toEqual(Object.keys(none()).sort())
  })
})

describe("fromNullable()", () => {
  it("test_from_nullable_returns_some_for_value", () => {
    const opt = fromNullable(42)
    expect(opt.some).toBe(true)
    expect(opt.value).toBe(42)
  })

  it("test_from_nullable_returns_none_for_null", () => {
    expect(fromNullable(null).some).toBe(false)
  })

  it("test_from_nullable_returns_none_for_undefined", () => {
    expect(fromNullable(undefined).some).toBe(false)
  })

  it("test_from_nullable_returns_some_for_zero", () => {
    expect(fromNullable(0).some).toBe(true)
  })

  it("test_from_nullable_returns_some_for_empty_string", () => {
    expect(fromNullable("").some).toBe(true)
  })
})

describe("toNullable()", () => {
  it("test_to_nullable_returns_value_for_some", () => {
    expect(toNullable(some(7))).toBe(7)
  })

  it("test_to_nullable_returns_null_for_none", () => {
    expect(toNullable(none())).toBeNull()
  })
})
