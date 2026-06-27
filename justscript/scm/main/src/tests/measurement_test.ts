import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { measurementRegistry }                         from "../spi/index.js"
import { ok, err }                                     from "../core/result.js"
import { some, none }                                  from "../core/option.js"

function makeMockProvider() {
  const counts: Record<string, number> = {}
  return {
    onConstruct(label: string): void { counts[label] = (counts[label] ?? 0) + 1 },
    report()      { return { allocations: { ...counts } } },
    resetCounter(){ for (const k of Object.keys(counts)) delete counts[k] },
  }
}

describe("ok() measurement hook", () => {
  beforeEach(() => measurementRegistry.unregister())
  afterEach(() => measurementRegistry.unregister())

  it("test_ok_increments_result_ok_when_provider_registered", () => {
    const p = makeMockProvider()
    measurementRegistry.register(p)
    ok(42)
    expect(p.report().allocations["Result.Ok"]).toBe(1)
  })

  it("test_ok_does_not_throw_when_no_provider_registered", () => {
    expect(() => ok(42)).not.toThrow()
  })

  it("test_err_increments_result_err_when_provider_registered", () => {
    const p = makeMockProvider()
    measurementRegistry.register(p)
    err("failure")
    expect(p.report().allocations["Result.Err"]).toBe(1)
  })
})

describe("some() and none() measurement hooks", () => {
  beforeEach(() => measurementRegistry.unregister())
  afterEach(() => measurementRegistry.unregister())

  it("test_some_increments_option_some_when_provider_registered", () => {
    const p = makeMockProvider()
    measurementRegistry.register(p)
    some("value")
    expect(p.report().allocations["Option.Some"]).toBe(1)
  })

  it("test_none_increments_option_none_when_provider_registered", () => {
    const p = makeMockProvider()
    measurementRegistry.register(p)
    none()
    expect(p.report().allocations["Option.None"]).toBe(1)
  })

  it("test_mixed_allocations_tracked_separately", () => {
    const p = makeMockProvider()
    measurementRegistry.register(p)
    ok(1); ok(2); err("x"); some("a"); none()
    const r = p.report()
    expect(r.allocations["Result.Ok"]).toBe(2)
    expect(r.allocations["Result.Err"]).toBe(1)
    expect(r.allocations["Option.Some"]).toBe(1)
    expect(r.allocations["Option.None"]).toBe(1)
  })
})
