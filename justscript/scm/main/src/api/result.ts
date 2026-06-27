export interface Result<T, E> {
  readonly ok:    boolean
  readonly value: T    | null
  readonly error: E    | null
}

export interface Ok<T, E = never> extends Result<T, E> {
  readonly ok:    true
  readonly value: T
  readonly error: null
}

export interface Err<T = never, E = unknown> extends Result<T, E> {
  readonly ok:    false
  readonly value: null
  readonly error: E
}

export type AsyncResult<T, E> = Promise<Result<T, E>>
