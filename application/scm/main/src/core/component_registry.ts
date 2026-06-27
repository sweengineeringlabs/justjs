import type { ComponentRegistry } from "../api/router.js"

export class DefaultComponentRegistry implements ComponentRegistry {
  readonly #components = new Map<string, { id: string; tagName: string }>()

  register(id: string, tagName: string): void {
    this.#components.set(id, { id, tagName })
  }

  get(id: string): { id: string; tagName: string } | null {
    return this.#components.get(id) ?? null
  }

  all(): Array<{ id: string; tagName: string }> {
    return [...this.#components.values()]
  }
}
