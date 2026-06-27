export interface Ok<T, E = never> {
  readonly ok:    true
  readonly value: T
  readonly error: null
}

export interface Err<T = never, E = unknown> {
  readonly ok:    false
  readonly value: null
  readonly error: E
}

export type Result<T, E>      = Ok<T, E> | Err<T, E>
export type AsyncResult<T, E> = Promise<Result<T, E>>
