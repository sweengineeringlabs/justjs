import { describe, it, expect } from "bun:test"
import { some, none }           from "../core/option.js"
import { mapOption, andThenOption, unwrapOptionOr, matchOption } from "../core/option_combinators.js"

describe("mapOption()", () => {
  it("test_map_option_transforms_some_value", () => {
    const opt = mapOption(some(3), x => x * 2)
    expect(opt.some).toBe(true)
    expect(opt.value).toBe(6)
  })

  it("test_map_option_passes_none_through", () => {
    const opt = mapOption(none(), x => (x as number) * 2)
    expect(opt.some).toBe(false)
  })
})

describe("andThenOption()", () => {
  it("test_and_then_option_chains_some", () => {
    const opt = andThenOption(some(5), x => some(x + 1))
    expect(opt.some).toBe(true)
    expect(opt.value).toBe(6)
  })

  it("test_and_then_option_flattens_none", () => {
    const opt = andThenOption(some(5), () => none())
    expect(opt.some).toBe(false)
  })

  it("test_and_then_option_short_circuits_on_none", () => {
    let called = false
    andThenOption(none(), v => { called = true; return some(v) })
    expect(called).toBe(false)
  })
})

describe("unwrapOptionOr()", () => {
  it("test_unwrap_option_returns_value_on_some", () => {
    expect(unwrapOptionOr(some(42), 0)).toBe(42)
  })

  it("test_unwrap_option_returns_fallback_on_none", () => {
    expect(unwrapOptionOr(none(), 99)).toBe(99)
  })
})

describe("matchOption()", () => {
  it("test_match_option_calls_some_handler", () => {
    const result = matchOption(some(10), { some: v => v * 2, none: () => -1 })
    expect(result).toBe(20)
  })

  it("test_match_option_calls_none_handler", () => {
    const result = matchOption(none(), { some: (v: number) => v, none: () => -1 })
    expect(result).toBe(-1)
  })
})
