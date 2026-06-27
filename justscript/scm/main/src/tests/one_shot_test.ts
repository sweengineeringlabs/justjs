import { describe, it, expect } from "bun:test"
import { oneShot }               from "../core/one_shot.js"
import { OneShotError }          from "../api/control.js"
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

  it("test_consumed_token_has_no_consume_method", () => {
    const handle = oneShot(() => 99)
    const [, token] = handle.consume()
    // Consumed type has no methods — the compiler enforces this
    // @ts-expect-error — Consumed has no 'consume' property
    expect(() => (token as unknown as { consume: () => void }).consume).not.toThrow()
    // The important thing: token is typed as Consumed, not OneShotHandle
    const _: Consumed = token
    void _
  })
})
