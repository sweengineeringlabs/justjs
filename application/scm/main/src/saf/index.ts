export type {
  ComponentProps,
  Component,
  ComponentContext,
  MountHandle,
} from "../api/api_component.js"
export { ComponentError } from "../api/api_component.js"

export type {
  LifecycleEventType,
  LifecycleStep,
  Lifecycle,
} from "../api/api_lifecycle.js"
export { LifecycleError } from "../api/api_lifecycle.js"

export type {
  BootConfig,
  JustJSBoot,
} from "../api/api_boot.js"
export { BootError } from "../api/api_boot.js"

export type {
  ComponentRegistry,
  Router,
} from "../api/api_registry.js"
export { RegistryError } from "../api/api_registry.js"

export { DefaultComponentRegistry } from "../core/registry/component_registry.js"
export { DefaultRouter } from "../core/registry/router.js"
export { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
export { JustJS, justjs } from "../core/boot.js"

export type { AspectProvider, JustJSAspect, AspectTarget } from "../api/api_aspect.js"
