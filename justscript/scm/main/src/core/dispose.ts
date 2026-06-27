import type { Disposable } from "../api/dispose.js"

export function makeDisposable<T extends object>(resource: T, cleanup: (resource: T) => void): T & Disposable {
  return Object.assign(
    Object.create(resource as object) as T,
    {
      [Symbol.dispose](): void { cleanup(resource) },
    },
  ) as T & Disposable
}
