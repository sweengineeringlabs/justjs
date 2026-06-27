import type { Disposable, AsyncDisposable } from "../api/dispose.js"

export function makeDisposable<T extends object>(resource: T, cleanup: (resource: T) => void): T & Disposable {
  return Object.assign(
    Object.create(resource as object) as T,
    {
      [Symbol.dispose](): void { cleanup(resource) },
    },
  ) as T & Disposable
}

export function makeAsyncDisposable<T extends object>(
  resource: T,
  cleanup: (resource: T) => Promise<void>,
): T & AsyncDisposable {
  return Object.assign(
    Object.create(resource as object) as T,
    {
      [Symbol.asyncDispose](): Promise<void> { return cleanup(resource) },
    },
  ) as T & AsyncDisposable
}
