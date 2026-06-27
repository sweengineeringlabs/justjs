import type { Result, Ok, Err, AsyncResult } from "../api/result.js"
import { ok, err }                            from "./result.js"

export function mapResult<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) return ok<U, E>(fn(result.value as T))
  return result as unknown as Err<U, E>
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) return err<T, F>(fn(result.error as E))
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
  return fn(result.value as T)
}

export function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
  if (result.ok) return result as unknown as Ok<T, F>
  return fn(result.error as E)
}

export function unwrapResultOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? (result.value as T) : fallback
}

export function matchResult<T, E, R>(
  result: Result<T, E>,
  handlers: { ok: (value: T) => R; err: (error: E) => R },
): R {
  if (result.ok) return handlers.ok(result.value as T)
  return handlers.err(result.error as E)
}
