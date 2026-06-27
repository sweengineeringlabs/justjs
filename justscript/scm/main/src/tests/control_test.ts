import { describe, it, expect } from "bun:test"
import { exhaust, disposable, oneShot } from "../core/control.js"
import { OneShotError }                 from "../api/control.js"

describe("exhaust()", () => {
  it("test_exhaust_throws_on_unexpected_value", () => {
    expect(() => exhaust("unexpected" as never)).toThrow("Unhandled variant")
  })

  it("test_exhaust_message_includes_the_value", () => {
    let msg = ""
    try { exhaust("x" as never) } catch (e) { msg = (e as Error).message }
    expect(msg).toContain("x")
  })
})

describe("disposable()", () => {
  it("test_disposable_calls_cleanup_function_on_dispose", () => {
    let called = false
    const d = disposable(() => { called = true })
    d.dispose()
    expect(called).toBe(true)
  })

  it("test_disposable_dispose_can_be_called_multiple_times", () => {
    let count = 0
    const d = disposable(() => { count++ })
    d.dispose()
    d.dispose()
    expect(count).toBe(2)
  })
})

describe("oneShot()", () => {
  it("test_one_shot_returns_result_on_first_call", () => {
    const fn = oneShot((x: number) => x * 2)
    expect(fn(5)).toBe(10)
  })

  it("test_one_shot_throws_on_second_call", () => {
    const fn = oneShot(() => "value")
    fn()
    expect(() => fn()).toThrow(OneShotError)
  })

  it("test_one_shot_error_name_is_OneShotError", () => {
    const fn = oneShot(() => {})
    fn()
    let err: Error | undefined
    try { fn() } catch (e) { err = e as Error }
    expect(err?.name).toBe("OneShotError")
  })

  it("test_one_shot_throws_on_third_call", () => {
    const fn = oneShot(() => {})
    fn()
    try { fn() } catch {}
    expect(() => fn()).toThrow(OneShotError)
  })

  it("test_one_shot_passes_args_to_wrapped_function", () => {
    const received: number[] = []
    const fn = oneShot((a: number, b: number) => { received.push(a, b) })
    fn(3, 7)
    expect(received).toEqual([3, 7])
  })

  it("test_one_shot_used_false_before_first_call", () => {
    let called = false
    const fn = oneShot(() => { called = true })
    expect(called).toBe(false)
    fn()
    expect(called).toBe(true)
  })
})
