import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { AllocationCounter, measurementRegistry }       from "@justscript/measurement"
import { ok, err }                                      from "../core/result.js"
import { some, none }                                   from "../core/option.js"

describe("ok() measurement hook", () => {
  beforeEach(() => measurementRegistry.uninstall())
  afterEach(() => measurementRegistry.uninstall())

  it("test_ok_increments_result_ok_when_counter_installed", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    ok(42)
    expect(counter.report().allocations["Result.Ok"]).toBe(1)
  })

  it("test_ok_does_not_throw_when_no_counter_installed", () => {
    expect(() => ok(42)).not.toThrow()
  })

  it("test_err_increments_result_err_when_counter_installed", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    err("failure")
    expect(counter.report().allocations["Result.Err"]).toBe(1)
  })
})

describe("some() and none() measurement hooks", () => {
  beforeEach(() => measurementRegistry.uninstall())
  afterEach(() => measurementRegistry.uninstall())

  it("test_some_increments_option_some_when_counter_installed", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    some("value")
    expect(counter.report().allocations["Option.Some"]).toBe(1)
  })

  it("test_none_increments_option_none_when_counter_installed", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    none()
    expect(counter.report().allocations["Option.None"]).toBe(1)
  })

  it("test_mixed_allocations_tracked_separately", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    ok(1); ok(2); err("x"); some("a"); none()
    const r = counter.report()
    expect(r.allocations["Result.Ok"]).toBe(2)
    expect(r.allocations["Result.Err"]).toBe(1)
    expect(r.allocations["Option.Some"]).toBe(1)
    expect(r.allocations["Option.None"]).toBe(1)
  })
})
