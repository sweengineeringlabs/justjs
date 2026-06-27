export interface Some<T> {
  readonly some:  true
  readonly value: T
}

export interface None {
  readonly some:  false
  readonly value: null
}

export type Option<T> = Some<T> | None
