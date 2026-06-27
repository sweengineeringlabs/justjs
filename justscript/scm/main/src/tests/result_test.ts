import { describe, it, expect } from "bun:test"
import { ok, err, asyncOk, asyncErr } from "../core/result.js"

describe("ok()", () => {
  it("test_ok_with_integer_has_ok_true", () => {
    expect(ok(42).ok).toBe(true)
  })

  it("test_ok_with_string_preserves_value", () => {
    expect(ok("hello").value).toBe("hello")
  })

  it("test_ok_with_value_has_null_error", () => {
    expect(ok(1).error).toBeNull()
  })

  it("test_ok_with_null_value_has_ok_true", () => {
    const r = ok(null)
    expect(r.ok).toBe(true)
    expect(r.value).toBeNull()
  })
})

describe("err()", () => {
  it("test_err_with_error_has_ok_false", () => {
    expect(err(new Error("boom")).ok).toBe(false)
  })

  it("test_err_with_error_preserves_error", () => {
    const e = new Error("not found")
    expect(err(e).error).toBe(e)
  })

  it("test_err_with_error_has_null_value", () => {
    expect(err("fail").value).toBeNull()
  })

  it("test_ok_and_err_with_values_have_same_keys_for_v8_monomorphism", () => {
    const success = ok(1)
    const failure = err("e")
    expect(Object.keys(success).sort()).toEqual(Object.keys(failure).sort())
  })
})

describe("asyncOk() / asyncErr()", () => {
  it("test_async_ok_with_integer_resolves_to_ok_result", async () => {
    const r = await asyncOk(42)
    expect(r.ok).toBe(true)
    expect(r.value).toBe(42)
  })

  it("test_async_err_with_string_resolves_to_err_result", async () => {
    const r = await asyncErr("oops")
    expect(r.ok).toBe(false)
    expect(r.error).toBe("oops")
  })
})
