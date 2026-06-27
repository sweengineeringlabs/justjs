import type { Some, None }       from "../api/option.js"
import { measurementRegistry }   from "./measurement.js"

export function some<T>(value: T): Some<T> {
  measurementRegistry.current?.onConstruct("Option.Some")
  return { some: true, value } as Some<T>
}

export function none<T = never>(): None<T> {
  measurementRegistry.current?.onConstruct("Option.None")
  return { some: false, value: undefined } as None<T>
}
