import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { AllocationCounter }                           from "../core/allocation_counter.js"
import { NullMeasurementProvider }                     from "../core/null_measurement_provider.js"
import { measurementRegistry }                         from "../spi/index.js"

describe("AllocationCounter", () => {
  let counter: AllocationCounter

  beforeEach(() => {
    counter = new AllocationCounter()
  })

  it("test_on_construct_increments_label_count", () => {
    counter.onConstruct("Result.Ok")
    expect(counter.report().allocations["Result.Ok"]).toBe(1)
  })

  it("test_on_construct_accumulates_multiple_calls", () => {
    counter.onConstruct("Result.Ok")
    counter.onConstruct("Result.Ok")
    counter.onConstruct("Result.Ok")
    expect(counter.report().allocations["Result.Ok"]).toBe(3)
  })

  it("test_on_construct_tracks_distinct_labels_independently", () => {
    counter.onConstruct("Result.Ok")
    counter.onConstruct("Result.Err")
    const r = counter.report()
    expect(r.allocations["Result.Ok"]).toBe(1)
    expect(r.allocations["Result.Err"]).toBe(1)
  })

  it("test_report_returns_snapshot_not_live_reference", () => {
    counter.onConstruct("Result.Ok")
    const r = counter.report()
    counter.onConstruct("Result.Ok")
    expect(r.allocations["Result.Ok"]).toBe(1)
  })

  it("test_reset_counter_clears_all_counts", () => {
    counter.onConstruct("Result.Ok")
    counter.onConstruct("Option.Some")
    counter.resetCounter()
    expect(Object.keys(counter.report().allocations)).toHaveLength(0)
  })

  it("test_report_after_reset_has_no_labels", () => {
    counter.onConstruct("Result.Ok")
    counter.resetCounter()
    expect(counter.report().allocations["Result.Ok"]).toBeUndefined()
  })
})

describe("NullMeasurementProvider", () => {
  it("test_on_construct_is_a_no_op", () => {
    const p = new NullMeasurementProvider()
    expect(() => p.onConstruct("Result.Ok")).not.toThrow()
  })

  it("test_report_returns_empty_allocations", () => {
    const p = new NullMeasurementProvider()
    p.onConstruct("Result.Ok")
    expect(Object.keys(p.report().allocations)).toHaveLength(0)
  })

  it("test_reset_counter_is_a_no_op", () => {
    const p = new NullMeasurementProvider()
    expect(() => p.resetCounter()).not.toThrow()
  })
})

describe("measurementRegistry (from @justscript/core)", () => {
  beforeEach(() => measurementRegistry.unregister())
  afterEach(() => measurementRegistry.unregister())

  it("test_current_is_null_when_no_provider_registered", () => {
    expect(measurementRegistry.current).toBeNull()
  })

  it("test_register_sets_current_provider", () => {
    const counter = new AllocationCounter()
    measurementRegistry.register(counter)
    expect(measurementRegistry.current).toBe(counter)
  })

  it("test_unregister_clears_current_provider", () => {
    measurementRegistry.register(new AllocationCounter())
    measurementRegistry.unregister()
    expect(measurementRegistry.current).toBeNull()
  })

  it("test_register_replaces_existing_provider", () => {
    const first  = new AllocationCounter()
    const second = new AllocationCounter()
    measurementRegistry.register(first)
    measurementRegistry.register(second)
    expect(measurementRegistry.current).toBe(second)
  })
})
