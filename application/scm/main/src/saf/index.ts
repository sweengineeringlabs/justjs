export type {
  ComponentProps,
  Component,
  ComponentContext,
  MountHandle,
} from "../api/component.js"
export { ComponentError } from "../api/component.js"

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

export type {
  ComponentRegistry,
  Router,
} from "../api/registry.js"
export { RegistryError } from "../api/registry.js"

export { DefaultComponentRegistry } from "../core/registry/component_registry.js"
export { DefaultRouter } from "../core/registry/router.js"
export { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
export { JustJS } from "../core/boot.js"
