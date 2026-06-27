import { describe, it, expect } from "bun:test"
import { oneShot, OneShotError } from "../core/one_shot.js"
import type { Consumed }         from "../api/control.js"

describe("oneShot()", () => {
  it("test_consume_returns_value_on_first_call", () => {
    const handle = oneShot(() => 42)
    const [value] = handle.consume()
    expect(value).toBe(42)
  })

  it("test_consume_returns_consumed_token", () => {
    const handle = oneShot(() => "secret")
    const [, token] = handle.consume()
    expect(token).toBeDefined()
  })

  it("test_consume_throws_one_shot_error_on_second_call", () => {
    const handle = oneShot(() => "value")
    handle.consume()
    expect(() => handle.consume()).toThrow(OneShotError)
  })

  it("test_consume_throws_on_third_call", () => {
    const handle = oneShot(() => {})
    handle.consume()
    try { handle.consume() } catch {}
    expect(() => handle.consume()).toThrow(OneShotError)
  })

  it("test_consume_passes_args_from_fn_to_result", () => {
    const handle = oneShot(() => ({ id: 1, name: "Alice" }))
    const [value] = handle.consume()
    expect(value.id).toBe(1)
  })

  it("test_consumed_token_reuse_is_a_compile_time_error", () => {
    const handle = oneShot(() => 99)
    const [, token] = handle.consume()
    // token is Consumed — it has no consume() method
    // @ts-expect-error — Property 'consume' does not exist on type 'Consumed'
    void token.consume
    // Ensure token satisfies Consumed (not OneShotHandle) at the type level
    const _: Consumed = token
    void _
  })
})
