declare const _consumed: unique symbol

export class OneShotError extends Error {
  constructor() {
    super("OneShot: called more than once")
    this.name = "OneShotError"
  }
}

export type Consumed = { readonly [_consumed]: true }

export interface OneShotHandle<T> {
  consume(): readonly [value: T, token: Consumed]
}
