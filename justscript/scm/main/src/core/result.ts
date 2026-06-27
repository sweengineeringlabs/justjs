import type { Ok, Err, AsyncResult } from "../api/result.js"
import { measurementRegistry }       from "./measurement_registry.js"

export function ok<T, E = never>(value: T): Ok<T, E> {
  measurementRegistry.current?.onConstruct("Result.Ok")
  return { ok: true, value, error: null } as Ok<T, E>
}

export function err<T = never, E = unknown>(error: E): Err<T, E> {
  measurementRegistry.current?.onConstruct("Result.Err")
  return { ok: false, value: null, error } as Err<T, E>
}

export function asyncOk<T, E = never>(value: T): AsyncResult<T, E> {
  return Promise.resolve(ok<T, E>(value))
}

export function asyncErr<T = never, E = unknown>(error: E): AsyncResult<T, E> {
  return Promise.resolve(err<T, E>(error))
}
