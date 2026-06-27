import type { Ok, Err }          from "../api/result.js"
import { measurementRegistry }   from "@justscript/measurement"

export function ok<T, E = never>(value: T): Ok<T, E> {
  measurementRegistry.current?.onConstruct("Result.Ok")
  return { ok: true, value, error: undefined } as Ok<T, E>
}

export function err<T = never, E = unknown>(error: E): Err<T, E> {
  measurementRegistry.current?.onConstruct("Result.Err")
  return { ok: false, value: undefined, error } as Err<T, E>
}
