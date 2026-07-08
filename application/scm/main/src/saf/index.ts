export type {
  ComponentProps,
  Component,
  ComponentContext,
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
} from "../api/boot.js"
export { BootError } from "../api/boot.js"

export type { Router, ComponentRegistry, LazyCustomElementRegistry } from "../api/registry.js"
export { RegistryError } from "../api/registry.js"

export type { DomAddressElement, DomAddressMap } from "../api/dom-address.js"

export { DefaultComponentRegistry } from "../core/registry/component_registry.js"
export { adaptCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
export { DefaultRouter } from "../core/registry/router.js"
export { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
export { JustJS, justjs } from "../core/boot.js"

export type { AspectProvider, JustJSAspect, AspectTarget } from "../api/aspect.js"
