import type { Component, ComponentProps } from "./component.js"

export interface Router {
  navigate(path: string): Promise<void>
  currentPath(): string
}

// The shape RenderStep/UpdateStep actually depend on — DefaultComponentRegistry
// is the one real implementation, but depending on this interface (rather than
// the concrete class) keeps the lifecycle swappable/testable without needing
// a full DefaultComponentRegistry instance, matching the RuntimeAdapter/Router
// interface+Default* split used elsewhere in this package.
export interface ComponentRegistry {
  get(tag: string, props?: ComponentProps): Promise<Component>
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RegistryError"
  }
}
