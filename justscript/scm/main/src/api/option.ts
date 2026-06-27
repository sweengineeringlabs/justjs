export interface Option<T> {
  readonly some:  boolean
  readonly value: T | null
}

export interface Some<T> extends Option<T> {
  readonly some:  true
  readonly value: T
}

export interface None extends Option<never> {
  readonly some:  false
  readonly value: null
}
