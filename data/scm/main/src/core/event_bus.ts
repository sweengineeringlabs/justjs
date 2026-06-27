import type { UIEventBus, UIEvent } from "../api/store.js"

export class DefaultUIEventBus implements UIEventBus {
  readonly #subscribers = new Map<string, Set<(event: UIEvent) => void>>()

  publish(event: UIEvent): void {
    const fns = this.#subscribers.get(event.type)
    if (fns) for (const fn of fns) fn(event)
  }

  subscribe(type: string, fn: (event: UIEvent) => void): () => void {
    let fns = this.#subscribers.get(type)
    if (fns === undefined) { fns = new Set(); this.#subscribers.set(type, fns) }
    fns.add(fn)
    return () => { fns!.delete(fn) }
  }
}
