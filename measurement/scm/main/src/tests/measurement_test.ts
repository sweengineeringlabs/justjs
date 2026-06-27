import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { AllocationCounter, measurementRegistry }       from "../core/measurement.js"

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

describe("measurementRegistry", () => {
  beforeEach(() => measurementRegistry.uninstall())
  afterEach(() => measurementRegistry.uninstall())

  it("test_current_is_null_when_no_provider_installed", () => {
    expect(measurementRegistry.current).toBeNull()
  })

  it("test_install_sets_current_provider", () => {
    const counter = new AllocationCounter()
    measurementRegistry.install(counter)
    expect(measurementRegistry.current).toBe(counter)
  })

  it("test_uninstall_clears_current_provider", () => {
    measurementRegistry.install(new AllocationCounter())
    measurementRegistry.uninstall()
    expect(measurementRegistry.current).toBeNull()
  })
})
