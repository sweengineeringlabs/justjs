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
export type { JustWebArtifactDigest, JustWebArtifactManifest, JustWebContractPin, JustWebRuntimeMetadata, ValidatedJustWebContract } from "../api/justweb_contract.js"
export { JustWebContractValidationError } from "../api/justweb_contract.js"
export { validateJustWebRuntimeMetadata } from "../api/justweb_contract.js"
export { SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA, SUPPORTED_JUSTWEB_GENERATOR_REVISION, SUPPORTED_JUSTWEB_GENERATOR_VERSION } from "../api/justweb_contract.js"

export type { ErrorBoundary } from "../api/error_boundary.js"

export { adaptCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
export { justjs } from "../core/boot.js"

export type { AspectProvider, JustJSAspect, AspectTarget } from "../api/aspect.js"

import { BootError } from "../api/boot.js"
import { assertValidatedJustWebContract, type ValidatedJustWebContract } from "../api/justweb_contract.js"
import type { Lifecycle } from "../api/lifecycle.js"
import type { MutableComponentRegistry, RouteRegistryEntry, Router } from "../api/registry.js"
import type { RuntimeAdapter } from "../api/component.js"
import type { ErrorBoundary } from "../api/error_boundary.js"
import type { FeatureStore, UIEventBus } from "@justjs/data"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { DefaultRouter } from "../core/registry/router.js"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ComponentRegistry/Router/Lifecycle contract, never the concrete Default*
// class name, so the implementation can change without breaking anyone.
export function createComponentRegistry(contract: ValidatedJustWebContract): MutableComponentRegistry {
  assertValidatedJustWebContract(contract)
  return new DefaultComponentRegistry(new Set(Object.values(contract.domAddressMap.elements).map((element) => element.tag)))
}

export function createLifecycle(
  contract: ValidatedJustWebContract,
  runtimeAdapter?: RuntimeAdapter,
  registry?: MutableComponentRegistry,
  errorBoundary?: ErrorBoundary
): Lifecycle {
  assertValidatedJustWebContract(contract)
  return new DefaultLifecycle(contract.domAddressMap, runtimeAdapter, registry, errorBoundary)
}

export function createRouter(
  routes: readonly string[],
  registry: Record<string, RouteRegistryEntry>,
  lifecycle: Lifecycle,
  contract: ValidatedJustWebContract,
  featureStore?: FeatureStore,
  eventBus?: UIEventBus
): Router {
  assertValidatedJustWebContract(contract)
  const domAddressMap = contract.domAddressMap
  if (!contract.routes) {
    throw new BootError("INVALID_JUSTWEB_MANIFEST", undefined, undefined, undefined, "Router construction requires routes from the validated JustWeb contract.")
  }
  const declaredRoutes = [...contract.routes].sort()
  const requestedRoutes = [...routes].sort()
  if (JSON.stringify(declaredRoutes) !== JSON.stringify(requestedRoutes)) {
    throw new BootError("ROUTE_NOT_IN_REGISTRY", requestedRoutes.join(","), declaredRoutes,
      undefined, "Router routes must exactly match the route list validated from JustWeb metadata.")
  }
  const knownComponents = new Set(Object.values(domAddressMap.elements).map((element) => element.tag))
  const registeredPaths = new Set<string>()
  for (const [tag, entry] of Object.entries(registry)) {
    if (!knownComponents.has(tag)) {
      throw new BootError("MISSING_DDAS_ENTRY", tag, [...knownComponents].filter((known): known is string => typeof known === "string"))
    }
    if (!contract.routes.includes(entry.path) || registeredPaths.has(entry.path)) {
      throw new BootError("REGISTRY_NOT_IN_ROUTES", entry.path, [...contract.routes], undefined,
        `Route registry entry "${tag}" is missing from JustWeb routes or duplicates another route.`)
    }
    registeredPaths.add(entry.path)
  }
  if (registeredPaths.size !== requestedRoutes.length) {
    throw new BootError("ROUTE_NOT_IN_REGISTRY", undefined, [...registeredPaths], undefined,
      "Every route in the validated JustWeb contract must have exactly one registry entry.")
  }
  return new DefaultRouter(routes, registry, lifecycle, domAddressMap, featureStore, eventBus)
}
