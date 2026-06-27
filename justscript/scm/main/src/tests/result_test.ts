import { describe, it, expect } from "bun:test"
import { ok, err }              from "../core/result.js"

describe("ok()", () => {
  it("test_ok_has_ok_true", () => {
    expect(ok(42).ok).toBe(true)
  })

  it("test_ok_carries_value", () => {
    expect(ok("hello").value).toBe("hello")
  })

  it("test_ok_error_is_undefined", () => {
    expect(ok(1).error).toBeUndefined()
  })

  it("test_ok_value_is_accessible_after_narrowing", () => {
    const r = ok<number, string>(7)
    if (r.ok) {
      expect(r.value).toBe(7)
    } else {
      throw new Error("Should not reach err branch")
    }
  })

  it("test_ok_with_null_value", () => {
    const r = ok(null)
    expect(r.ok).toBe(true)
    expect(r.value).toBeNull()
  })

  it("test_ok_with_object_value", () => {
    const r = ok({ id: 1, name: "Alice" })
    expect(r.value?.id).toBe(1)
  })
})

describe("err()", () => {
  it("test_err_has_ok_false", () => {
    expect(err(new Error("boom")).ok).toBe(false)
  })

  it("test_err_carries_error", () => {
    const e = new Error("not found")
    expect(err(e).error).toBe(e)
  })

  it("test_err_value_is_undefined", () => {
    expect(err("fail").value).toBeUndefined()
  })

  it("test_err_after_narrowing", () => {
    const r = err<number, string>("bad input")
    if (!r.ok) {
      expect(r.error).toBe("bad input")
    } else {
      throw new Error("Should not reach ok branch")
    }
  })

  it("test_ok_and_err_have_same_shape_for_v8_monomorphism", () => {
    const success = ok(1)
    const failure = err("e")
    expect(Object.keys(success).sort()).toEqual(Object.keys(failure).sort())
  })
})
