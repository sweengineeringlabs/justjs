import type { Some, None, Option } from "../api/option.js"
import { measurementRegistry }     from "./measurement_registry.js"

const _none: None = Object.freeze({ some: false as const, value: null })

export function some<T>(value: T): Some<T> {
  measurementRegistry.current?.onConstruct("Option.Some")
  return { some: true as const, value }
}

export function none(): None {
  measurementRegistry.current?.onConstruct("Option.None")
  return _none
}

export function fromNullable<T>(value: T | null | undefined): Option<T> {
  return value == null ? none() : some(value)
}

export function toNullable<T>(option: Option<T>): T | null {
  return option.some ? option.value : null
}
