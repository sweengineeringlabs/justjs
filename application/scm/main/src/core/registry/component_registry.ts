import type { Component, ComponentProps } from "../../api/component.js"
import type { ComponentRegistry } from "../../api/registry.js"
import { RegistryError } from "../../api/registry.js"

export class DefaultComponentRegistry implements ComponentRegistry {
  private components = new Map<string, (props?: ComponentProps) => Component | Promise<Component>>()
  // Resolved-component cache, keyed by tag. A Component instance is meant to
  // persist across multiple render()/update() calls (e.g. adaptCustomElementRegistry's
  // element-reuse) - re-invoking the factory on every .get() would otherwise
  // build a fresh Component (and pay any factory cost, e.g. a dynamic import)
  // every single time RenderStep and UpdateStep each resolve the same tag
  // within one lifecycle pass.
  private resolved = new Map<string, Promise<Component>>()

  register(tag: string, factory: (props?: ComponentProps) => Component | Promise<Component>): void {
    if (!tag.includes("-")) {
      throw new RegistryError(`Component tag must include hyphen: ${tag}`)
    }
    this.components.set(tag, factory)
    this.resolved.delete(tag)
  }

  async get(tag: string, props?: ComponentProps): Promise<Component> {
    const cached = this.resolved.get(tag)
    if (cached) {
      return cached
    }

    const factory = this.components.get(tag)
    if (!factory) {
      throw new RegistryError(`Component not found: ${tag}`)
    }

    const promise = Promise.resolve(factory(props)).catch((error: unknown) => {
      // Don't let a transient factory failure permanently poison the tag -
      // the next .get() call gets a fresh attempt instead of the same cached
      // rejection forever.
      this.resolved.delete(tag)
      throw error
    })
    this.resolved.set(tag, promise)
    return promise
  }

  has(tag: string): boolean {
    return this.components.has(tag)
  }

  list(): string[] {
    return Array.from(this.components.keys())
  }
}
