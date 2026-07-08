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

// The fuller shape DefaultComponentRegistry actually exposes - a plain
// ComponentRegistry (get-only) is all RenderStep/UpdateStep need, but a
// caller building one up (or adaptCustomElementRegistry bridging one)
// needs register()/has()/list() too. Public so the saf-level
// createComponentRegistry()/adaptCustomElementRegistry() factories can
// return this instead of leaking the concrete DefaultComponentRegistry
// class as their return type.
export interface MutableComponentRegistry extends ComponentRegistry {
  register(tag: string, factory: (props?: ComponentProps) => Component | Promise<Component>): void
  has(tag: string): boolean
  list(): string[]
}

// justweb's real routes.yaml/routes.gen.json route-entry shape (see
// docs/adr/ADR-0001-ui-domain-layer.md's routes.yaml example and
// justweb#54's routes.gen.ts code) - params maps a dynamic `:segment` name
// to the component's own declared prop name. Lives here (api/), not in
// core/registry/router.ts where it previously was declared, for the same
// reason LazyCustomElementRegistry moved here: the public createRouter()
// factory needs to reference it and api/ may not import from core/.
export interface RouteRegistryEntry {
  readonly path: string
  readonly component: string
  readonly params?: Record<string, string>
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
