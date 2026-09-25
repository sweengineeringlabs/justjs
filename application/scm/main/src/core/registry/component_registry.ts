import type { Component, ComponentProps } from "../../api/component.js"
import type { ComponentRegistry } from "../../api/registry.js"
import { RegistryError } from "../../api/registry.js"
import { assertValidatedJustWebContract, type ValidatedJustWebContract } from "../../api/justweb_contract.js"

export class DefaultComponentRegistry implements ComponentRegistry {
  private components = new Map<string, (props?: ComponentProps) => Component | Promise<Component>>()
  // Resolved-component cache, keyed by tag. A Component instance is meant to
  // persist across multiple render()/update() calls (e.g. adaptCustomElementRegistry's
  // element-reuse) - re-invoking the factory on every .get() would otherwise
  // build a fresh Component (and pay any factory cost, e.g. a dynamic import)
  // every single time RenderStep and UpdateStep each resolve the same tag
  // within one lifecycle pass.
  private resolved = new Map<string, Promise<Component>>()
  private sealed = false

  constructor(private readonly allowedTags?: ReadonlySet<string>) {}

  register(tag: string, factory: (props?: ComponentProps) => Component | Promise<Component>): void {
    if (this.sealed) {
      throw new RegistryError("Component registry is sealed after JustWeb contract validation.")
    }
    if (!tag.includes("-")) {
      throw new RegistryError(`Component tag must include hyphen: ${tag}`)
    }
    if (this.allowedTags && !this.allowedTags.has(tag)) {
      throw new RegistryError(`Component tag "${tag}" is not declared by the JustWeb dom-address-map.`)
    }
    if (this.allowedTags && this.components.has(tag)) {
      throw new RegistryError(`Component tag "${tag}" is already registered under the JustWeb contract.`)
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

  seal(): void {
    this.sealed = true
  }
}

// Keeps post-boot registration inside the generated JustWeb contract. The
// caller may retain the original mutable registry, so the runtime uses this
// facade for every framework-managed lookup and registration after boot.
export function restrictComponentRegistry(registry: ComponentRegistry, contract: ValidatedJustWebContract): ComponentRegistry {
  assertValidatedJustWebContract(contract)
  const allowed = new Set(Object.values(contract.domAddressMap.elements).map((element) => element.tag))
  const mutable = registry as ComponentRegistry & { register?: DefaultComponentRegistry["register"]; has?: (tag: string) => boolean; list?: () => string[] }
  const resolved = new Map<string, Promise<Component>>()
  return {
    get(tag, props) {
      if (!allowed.has(tag)) {
        return Promise.reject(new RegistryError(`Component tag "${tag}" is not declared by the JustWeb dom-address-map.`))
      }
      const cached = resolved.get(tag)
      if (cached) return cached
      const pending = registry.get(tag, props).catch((error: unknown) => {
        resolved.delete(tag)
        throw error
      })
      resolved.set(tag, pending)
      return pending
    },
    ...(typeof mutable.register === "function" ? {
      register(tag: string, factory: Parameters<DefaultComponentRegistry["register"]>[1]): void {
        if (!allowed.has(tag)) {
          throw new RegistryError(`Component tag "${tag}" is not declared by the JustWeb dom-address-map.`)
        }
        mutable.register!(tag, factory)
      },
    } : {}),
    ...(typeof mutable.has === "function" ? { has: (tag: string) => mutable.has!(tag) } : {}),
    ...(typeof mutable.list === "function" ? { list: () => mutable.list!() } : {}),
  } as ComponentRegistry
}
