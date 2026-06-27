export interface Option<T> {
  readonly some:  boolean
  readonly value: T | undefined
}

export interface Some<T> extends Option<T> {
  readonly some:  true
  readonly value: T
}

export interface None<T = never> extends Option<T> {
  readonly some:  false
  readonly value: undefined
}
