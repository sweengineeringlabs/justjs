declare const _consumed: unique symbol

export type Consumed = { readonly [_consumed]: true }

export interface OneShotHandle<T> {
  consume(): readonly [value: T, token: Consumed]
}
