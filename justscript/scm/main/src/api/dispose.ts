export interface Disposable {
  [Symbol.dispose](): void
}

export interface AsyncDisposable {
  [Symbol.asyncDispose](): Promise<void>
}
