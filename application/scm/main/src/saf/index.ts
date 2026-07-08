export type {
  ComponentProps,
  Component,
  ComponentContext,
  ComponentDataContext,
  MountHandle,
  RuntimeAdapter,
} from "../api/component.js"
export { ComponentError, NoopRuntimeAdapter } from "../api/component.js"

export type {
  LifecycleEventType,
  LifecycleStep,
  Lifecycle,
} from "../api/lifecycle.js"
export { LifecycleError } from "../api/lifecycle.js"

export type {
  BootConfig,
  JustJSBoot,
  JustJSInstance,
  JustJSProviderRegistry,
  AspectProviderSpec,
} from "../api/boot.js"
export { BootError } from "../api/boot.js"

export type {
  Router,
  ComponentRegistry,
  MutableComponentRegistry,
  LazyCustomElementRegistry,
  RouteRegistryEntry,
} from "../api/registry.js"
export { RegistryError } from "../api/registry.js"

export type { DomAddressElement, DomAddressMap } from "../api/dom-address.js"

export { adaptCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
export { justjs } from "../core/boot.js"

export type { AspectProvider, JustJSAspect, AspectTarget } from "../api/aspect.js"

import type { DomAddressMap } from "../api/dom-address.js"
import type { Lifecycle } from "../api/lifecycle.js"
import type { MutableComponentRegistry, RouteRegistryEntry, Router } from "../api/registry.js"
import type { RuntimeAdapter } from "../api/component.js"
import type { FeatureStore, UIEventBus } from "@justjs/data"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { DefaultRouter } from "../core/registry/router.js"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ComponentRegistry/Router/Lifecycle contract, never the concrete Default*
// class name, so the implementation can change without breaking anyone.
export function createComponentRegistry(): MutableComponentRegistry {
  return new DefaultComponentRegistry()
}

export function createLifecycle(
  domAddressMap?: DomAddressMap,
  runtimeAdapter?: RuntimeAdapter,
  registry?: MutableComponentRegistry
): Lifecycle {
  return new DefaultLifecycle(domAddressMap, runtimeAdapter, registry)
}

export function createRouter(
  routes: readonly string[],
  registry: Record<string, RouteRegistryEntry>,
  lifecycle: Lifecycle,
  domAddressMap?: DomAddressMap,
  featureStore?: FeatureStore,
  eventBus?: UIEventBus
): Router {
  return new DefaultRouter(routes, registry, lifecycle, domAddressMap, featureStore, eventBus)
}
