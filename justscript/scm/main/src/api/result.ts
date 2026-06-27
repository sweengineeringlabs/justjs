export interface Result<T, E> {
  readonly ok:    boolean
  readonly value: T | undefined
  readonly error: E | undefined
}

export interface Ok<T, E = never> extends Result<T, E> {
  readonly ok:    true
  readonly value: T
  readonly error: undefined
}

export interface Err<T = never, E = unknown> extends Result<T, E> {
  readonly ok:    false
  readonly value: undefined
  readonly error: E
}
