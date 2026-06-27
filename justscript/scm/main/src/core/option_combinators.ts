import type { Option } from "../api/option.js"
import { some, none }  from "./option.js"
import { exhaust }     from "./exhaust.js"

export function mapOption<T, U>(option: Option<T>, fn: (value: T) => U): Option<U> {
  if (option.some) return some(fn(option.value))
  return none()
}

export function andThenOption<T, U>(option: Option<T>, fn: (value: T) => Option<U>): Option<U> {
  if (option.some) return fn(option.value)
  return none()
}

export function unwrapOptionOr<T>(option: Option<T>, fallback: T): T {
  return option.some ? option.value : fallback
}

export function matchOption<T, R>(
  option: Option<T>,
  handlers: { some: (value: T) => R; none: () => R },
): R {
  switch (option.some) {
    case true:  return handlers.some(option.value)
    case false: return handlers.none()
    default:    return exhaust(option)
  }
}
