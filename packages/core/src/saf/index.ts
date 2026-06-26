// Public contract surface — consumers import only from here.
// core/ implementations are not exported.

export type { Component, ComponentContext, MountHandle }  from "../api/component.js"
export type { LifecycleStep, Lifecycle, LifecycleEvent, LifecycleEventType } from "../api/lifecycle.js"
export type { Signal, WritableSignal, FeatureStore, Action, UIEventBus, UIEvent } from "../api/store.js"
export type { Principal, UISecurityContext, RouteGuard }  from "../api/security.js"
export type { Route, RouteMatch, Router, ComponentRegistry, InteractionProxy, InteractionEvent } from "../api/router.js"
export type { ApiAdapter, WsAdapter, WsConnection, CacheAdapter } from "../api/transport.js"
export type { RuntimeAdapter }                            from "../api/runtime.js"
export type { UIObserverContext, LogDrain }               from "../api/observer.js"
export type { AspectTarget, AspectConfig, AspectDeclaration, JustJSAspect, AspectProvider, AspectRegistry } from "../api/aspect.js"
export type { RoutesManifest, RegistryManifest, ImportMap, BootConfig, BootError } from "../api/boot.js"
export type { I18nContext }                                   from "../api/i18n.js"
export type { FlagsContext }                                  from "../api/flags.js"
export type { ComponentErrorPhase, ErrorBoundary }            from "../api/error_boundary.js"
