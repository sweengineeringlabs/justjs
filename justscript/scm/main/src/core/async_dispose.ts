import type { AsyncDisposable } from "../api/dispose.js"

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
