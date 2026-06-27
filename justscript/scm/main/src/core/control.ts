import type { Disposable }  from "../api/control.js"
import { OneShotError }     from "../api/control.js"
import type { Newtype }     from "../api/newtype.js"

export function exhaust(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`)
}

export function disposable(fn: () => void): Disposable {
  return { dispose: fn }
}

export function newtype<NT extends Newtype<unknown, unknown>>(
  value: NT extends Newtype<infer T, unknown> ? T : never,
): NT {
  return value as NT
}

export function oneShot<T extends unknown[], R>(fn: (...args: T) => R): (...args: T) => R {
  let used = false
  return (...args: T): R => {
    if (used) throw new OneShotError()
    used = true
    return fn(...args)
  }
}
