import type { Newtype } from "../api/newtype.js"

export function newtype<B extends string, T = string>(value: T): Newtype<B, T> {
  return value as Newtype<B, T>
}

export function unwrapNewtype<B extends string, T = string>(value: Newtype<B, T>): T {
  return value as T
}
