# ADR-0003: Data-layer wiring — giving components real access to `FeatureStore`/`UIEventBus`

- **Status:** Implemented (justjs#57-#59, all closed)
- **Date:** 2026-07-08

## Summary

ADR-0002 deliberately left `@justjs/data` out of scope: `ComponentContext` (`api/component.ts:11-15`) has no field for shared state, so nothing connects `FeatureStore`/`UIEventBus` (both real, tested, and used nowhere outside their own package) to a mounted component. This is the last gap in "everything justjs itself controls is wired" — everything else left after ADR-0002 (platform stubs, justweb's own router) is blocked upstream or cross-repo, not ours to close.

## Scope

**In scope:** giving a mounted `Component` real, optional access to a shared `FeatureStore`/`UIEventBus` at `render()`/`update()` time.

**Explicitly out of scope — a different design question, not designed here:**

Automatic re-render when store state changes *without* a new `navigate()`/explicit `update()` call. Two reasons this isn't designed now, not just deferred for convenience:
1. justweb#52 already wires `props:`/`states:` to signal-backed codegen *inside* each generated component class (`observedAttributes`/`attributeChangedCallback`) — individual components may already own their own reactivity for their own local state. Building a second, separate auto-re-render mechanism at the `@justjs/application` lifecycle layer risks fighting that, not complementing it.
2. Whether `FeatureStore` is meant as shared cross-component/cross-route state (a "read it when you render, dispatch into it on interaction" model — what this ADR designs) or as a live, subscribed reactive source that should force a re-render on every change is a product decision about the framework's reactivity model, not a wiring gap. Designing it here would be guessing, not deciding from evidence — same reasoning ADR-0002 used to leave dynamic route params unguessed.

## Design

**D6 — `Component.render`/`update` gain an optional third parameter.**

`Component` (`api/component.ts:5-9`) today:
```ts
export interface Component<Props extends ComponentProps = ComponentProps> {
  name: string
  render(props: Props, element: Element): void | Promise<void>
  update?(props: Props, element: Element): void | Promise<void>
}
```

Add an optional third `context` parameter carrying shared data-layer access — additive, not a breaking change (an implementation that ignores the third argument is still a valid `Component`):

```ts
export interface ComponentDataContext {
  readonly store?: FeatureStore
  readonly eventBus?: UIEventBus
}

export interface Component<Props extends ComponentProps = ComponentProps> {
  name: string
  render(props: Props, element: Element, ctx?: ComponentDataContext): void | Promise<void>
  update?(props: Props, element: Element, ctx?: ComponentDataContext): void | Promise<void>
}
```

`FeatureStore`/`UIEventBus` types come from `@justjs/data` — this is the one place `application`'s `api/` gains a real dependency on `@justjs/data` (declared but unused today, per justjs#51's original finding).

**D7 — `ComponentContext` carries the shared instances; `RenderStep`/`UpdateStep` pass them through.**

```ts
export interface ComponentContext {
  readonly tag: string
  readonly props: ComponentProps
  readonly element: Element
  readonly store?: FeatureStore
  readonly eventBus?: UIEventBus
}
```

`RenderStep`/`UpdateStep` (`lifecycle_pipeline.ts:63-108`) pass `{store: ctx.store, eventBus: ctx.eventBus}` as the third argument to `component.render()`/`component.update()` when either is present — no other step changes.

**D8 — `boot()` accepts and threads through a shared store/event bus.**

```ts
export interface BootConfig {
  // ...existing fields, plus D4's componentRegistry/runtimeAdapter/apiAdapter...
  readonly featureStore?: FeatureStore
  readonly eventBus?: UIEventBus
}
```

`buildRuntime()` (ADR-0002 D4) passes both through to wherever `ComponentContext` gets constructed — today that's `DefaultRouter.navigate()` (ADR-0002 D5), which includes them in every context it builds:

```ts
await this.lifecycle.run({ tag, props, element, store: this.featureStore, eventBus: this.eventBus })
```

No default instance is constructed if omitted (unlike D4's `apiAdapter`, which defaults to a real `DefaultApiAdapter`) — an app with no shared state need not pay for a `DefaultFeatureStore` it never uses. `store`/`eventBus` stay `undefined` unless a consumer supplies them.

## Build order

Depends on ADR-0002's phases (D4 `BootConfig` shape, D5 `DefaultRouter`'s context-building) already having landed — this extends both rather than replacing them.

| # | Phase | Depends on | New/changed files |
|---|---|---|---|
| 6 | D6 — `Component` gains optional `ComponentDataContext` param | ADR-0002 phase 5 (#56) | `application/api/component.ts` |
| 7 | D7 — `ComponentContext`/`RenderStep`/`UpdateStep` thread it through | 6 | `application/api/component.ts`, `application/core/lifecycle/lifecycle_pipeline.ts` |
| 8 | D8 — `boot()`/`DefaultRouter` accept and pass a shared store/event bus | 7 | `application/api/boot.ts`, `application/core/boot.ts`, `application/core/registry/router.ts` |

## Acceptance criteria

- [ ] `Component.render`/`update` accept an optional third `ComponentDataContext` argument; every existing implementation (none use it yet) still type-checks unchanged
- [ ] `ComponentContext` carries optional `store`/`eventBus`
- [ ] `RenderStep`/`UpdateStep` pass them through to `component.render()`/`update()` when present, and do nothing differently when absent
- [ ] `BootConfig` accepts `featureStore`/`eventBus`; when supplied, every `ComponentContext` `DefaultRouter` builds carries them; when omitted, both stay `undefined` — no default instance constructed
- [ ] `application/package.json` gains a real, used `@justjs/data` dependency (declared once, actually imported)
- [ ] Test: a component whose `render()` reads `ctx.store.state.value` and dispatches an action via `ctx.store.dispatch()` against a real `DefaultFeatureStore`, mounted through the full `boot()` → `router.navigate()` → `lifecycle.run()` path (not a hand-wired test harness)
- [ ] No regression in ADR-0002's existing tests/ACs (#52–#56)

## Consequences

- `application` gains a real dependency on `@justjs/data`'s types (`FeatureStore`, `UIEventBus`) — previously declared nowhere, now a genuine, minimal one.
- Components that want reactive re-render on store change still have to call `update()` themselves (e.g. from their own `store.subscribe()` callback) or rely on justweb's own per-component signal codegen — this ADR does not add automatic re-invocation.
- No change to any existing `Component` implementation's behavior — the new parameter is additive and optional.

## Relates to

- justjs#51 (data layer flagged as out of scope there)
- ADR-0002 (`docs/adr/ADR-0002-boot-wiring.md`) — D4/D5 this design extends
- justweb#52 (per-component signal codegen — the reason automatic re-render is explicitly not designed here)
