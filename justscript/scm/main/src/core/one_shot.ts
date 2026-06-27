import type { OneShotHandle, Consumed } from "../api/control.js"

export class OneShotError extends Error {
  constructor() {
    super("OneShot: called more than once")
    this.name = "OneShotError"
  }
}

const _consumed = Symbol("consumed")

class OneShotHandleImpl<T> implements OneShotHandle<T> {
  #used = false
  readonly #fn: () => T

  constructor(fn: () => T) { this.#fn = fn }

  consume(): readonly [value: T, token: Consumed] {
    if (this.#used) throw new OneShotError()
    this.#used = true
    return [this.#fn(), { [_consumed]: true } as unknown as Consumed]
  }
}

export function oneShot<T>(fn: () => T): OneShotHandle<T> {
  return new OneShotHandleImpl(fn)
}
