import type { Component, ComponentProps } from "../../api/api_component.js"
import { ComponentError } from "../../api/api_component.js"
import { RegistryError } from "../../api/api_registry.js"

export class DefaultComponentRegistry {
  private components = new Map<string, (props?: ComponentProps) => Component | Promise<Component>>()

  register(tag: string, factory: (props?: ComponentProps) => Component | Promise<Component>): void {
    if (!tag.includes("-")) {
      throw new RegistryError(`Component tag must include hyphen: ${tag}`)
    }
    this.components.set(tag, factory)
  }

  async get(tag: string, props?: ComponentProps): Promise<Component> {
    const factory = this.components.get(tag)
    if (!factory) {
      throw new RegistryError(`Component not found: ${tag}`)
    }
    return factory(props)
  }

  has(tag: string): boolean {
    return this.components.has(tag)
  }

  list(): string[] {
    return Array.from(this.components.keys())
  }
}
