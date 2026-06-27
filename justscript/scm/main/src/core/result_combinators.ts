import type { Result, Ok, Err, AsyncResult } from "../api/result.js"
import { ok, err }                            from "./result.js"
import { exhaust }                            from "./exhaust.js"

export function mapResult<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok<U, E>(fn(result.value))
  return result as unknown as Err<U, E>
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) return err<T, F>(fn(result.error))
  return result as unknown as Ok<T, F>
}

export function andThenResult<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => AsyncResult<U, E>,
): AsyncResult<U, E>
export function andThenResult<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E>
export function andThenResult<T, E, U>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E> | AsyncResult<U, E>,
): Result<U, E> | AsyncResult<U, E> {
  if (!result.ok) return result as unknown as Err<U, E>
  return fn(result.value)
}

export function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
  if (result.ok) return result as unknown as Ok<T, F>
  return fn(result.error)
}

export function unwrapResultOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

export function matchResult<T, E, R>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => R; err: (error: E) => R },
): R {
  switch (result.ok) {
    case true:  return handlers.ok(result.value)
    case false: return handlers.err(result.error)
    default:    return exhaust(result)
  }
}
