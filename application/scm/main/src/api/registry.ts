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

// justweb's `component-registry.gen.ts` (ADR-0008) exports this exact shape —
// a plain, lazy, enumerable map keyed by tag. `CustomElementConstructor` is the
// standard DOM-lib type (lib.dom.d.ts), not a justjs type. Lives here (api/),
// not in core/registry/component_registry_adapter.ts where it previously was
// declared, since BootConfig (also api/) needs to reference it and api/ may
// not import from core/ (SAF invariant S14).
export type LazyCustomElementRegistry = Record<string, () => Promise<CustomElementConstructor>>

export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RegistryError"
  }
}
