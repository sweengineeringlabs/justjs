import { describe, it, expect } from "bun:test"
import { ok, err }              from "../core/result.js"
import { mapResult, mapErr, andThenResult, orElse, unwrapResultOr, matchResult } from "../core/result_combinators.js"

describe("mapResult()", () => {
  it("test_map_result_with_ok_transforms_value", () => {
    const r = mapResult(ok(2), x => x * 3)
    expect(r.ok).toBe(true)
    expect(r.value).toBe(6)
  })

  it("test_map_result_with_err_passes_through_unchanged", () => {
    const r = mapResult(err<number, string>("bad"), x => x * 3)
    expect(r.ok).toBe(false)
    expect(r.error).toBe("bad")
  })
})

describe("mapErr()", () => {
  it("test_map_err_with_err_transforms_error_value", () => {
    const r = mapErr(err("oops"), e => e.toUpperCase())
    expect(r.ok).toBe(false)
    expect(r.error).toBe("OOPS")
  })

  it("test_map_err_with_ok_passes_through_unchanged", () => {
    const r = mapErr(ok<number, string>(5), e => e.toUpperCase())
    expect(r.ok).toBe(true)
    expect(r.value).toBe(5)
  })
})

describe("andThenResult()", () => {
  it("test_and_then_result_with_ok_chains_to_next", () => {
    const r = andThenResult(ok(5), x => ok(x + 1))
    expect(r.ok).toBe(true)
    expect(r.value).toBe(6)
  })

  it("test_and_then_result_with_err_short_circuits", () => {
    const r = andThenResult(err<number, string>("fail"), x => ok(x + 1))
    expect(r.ok).toBe(false)
    expect(r.error).toBe("fail")
  })

  it("test_and_then_result_with_async_fn_resolves_to_ok", async () => {
    const r = await andThenResult(ok(3), async x => ok(x * 2))
    expect(r.ok).toBe(true)
    expect(r.value).toBe(6)
  })
})

describe("orElse()", () => {
  it("test_or_else_with_err_returns_fallback_result", () => {
    const r = orElse(err<number, string>("bad"), () => ok(0))
    expect(r.ok).toBe(true)
    expect(r.value).toBe(0)
  })

  it("test_or_else_with_ok_returns_ok_unchanged", () => {
    const r = orElse(ok<number, string>(7), () => ok(0))
    expect(r.ok).toBe(true)
    expect(r.value).toBe(7)
  })
})

describe("unwrapResultOr()", () => {
  it("test_unwrap_result_or_with_ok_returns_value", () => {
    expect(unwrapResultOr(ok(42), 0)).toBe(42)
  })

  it("test_unwrap_result_or_with_err_returns_fallback", () => {
    expect(unwrapResultOr(err("x"), 99)).toBe(99)
  })
})

describe("matchResult()", () => {
  it("test_match_result_with_ok_calls_ok_handler", () => {
    const result = matchResult(ok(10), { ok: v => v * 2, err: () => -1 })
    expect(result).toBe(20)
  })

  it("test_match_result_with_err_calls_err_handler", () => {
    const result = matchResult(err<number, string>("fail"), { ok: v => v, err: e => e.length })
    expect(result).toBe(4)
  })
})
