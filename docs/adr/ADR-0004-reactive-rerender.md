# ADR-0004: Automatic re-render when the shared FeatureStore changes

- **Status:** Proposed
- **Date:** 2026-07-09

## Summary

ADR-0003 explicitly left this out: `FeatureStore`/`UIEventBus` are threaded into a mounted component (`ctx.store`/`ctx.eventBus`), but nothing triggers a re-render when the store changes — a component only ever renders once, at `navigate()` time. This is the one actual missing *capability* in the framework (as opposed to a maturity/adoption gap) — every comparable framework's foundational promise is "change state, UI updates."

## Why this wasn't designed in ADR-0003

Two real reasons, not just deferral:

1. justweb#52 already wires `props:`/`states:` to signal-backed codegen **inside each generated component class** (`observedAttributes`/`attributeChangedCallback` → an internal signal). Confirmed via `real_justweb_component_int_test.ts`: a real justweb-generated component's own `attributeChangedCallback` updates its own internal signal and (per that component's own generated logic) reacts to it directly — entirely inside the custom element, never going through `@justjs/application`'s `Lifecycle` at all. **This ADR is not about that** — a component's own declared props are already reactive. This ADR is about the `FeatureStore` `ComponentContext` carries: shared, cross-component/cross-route state that something *outside* the component changes.
2. `DefaultLifecycle.run(ctx)` (`lifecycle_pipeline.ts:137-146`) runs all five steps — `Resolve → Mount → Render → Update → Unmount` — **every single call**, with no concept of "stays mounted, reacts repeatedly, unmounts later." There is no live call site anywhere that calls `run()` more than once for the same navigation. Any reactivity design has to either live with that (accept a full 5-step re-run on every store change) or redesign the lifecycle's execution model — a much bigger change than this gap deserves as a first cut. This ADR picks the former, explicitly.

## Scope

**In scope:** the currently-navigated-to view re-renders automatically when the `FeatureStore` `DefaultRouter` was given changes.

**Out of scope, not guessed at:**
- Fine-grained/selector-based reactivity (only re-render if a specific slice of state changed, à la Redux's `connect`/`useSelector`). Needs its own design once real usage shows whether coarse-grained (re-render on any change) is actually too expensive in practice.
- Multiple simultaneously-mounted, independently-reactive components. `DefaultRouter` models one current route at a time today (confirmed: `currentRoute` is a single field, not a set) — this ADR doesn't change that.
- Any change to justweb's own per-component prop/state reactivity (#1 above) — already real, untouched.
- Optimizing the re-run to just `UpdateStep` instead of the full pipeline — noted as a known limitation below, not solved here.

## Decision

`DefaultRouter` owns the subscription, since it's the one real, long-lived caller of `lifecycle.run()` in production code (tests call `run()` directly for one-shot verification, which doesn't need reactivity). On each successful `navigate()`:

1. Unsubscribe any previous store subscription (from the *previous* route — it shouldn't keep re-rendering a view that's no longer current).
2. If `this.featureStore` is present, subscribe to it. On every notification, re-run `this.lifecycle.run(ctx)` with the **same** `ComponentContext` that `navigate()` just built.

```ts
export class DefaultRouter implements Router {
  private currentRoute = "/"
  private unsubscribeStore: (() => void) | undefined

  // ...existing constructor unchanged...

  async navigate(path: string): Promise<void> {
    // ...existing match/resolve/element logic unchanged...

    this.unsubscribeStore?.()
    this.unsubscribeStore = undefined

    this.currentRoute = path
    const ctx = this.buildContext(tag, element, props)
    await this.lifecycle.run(ctx)

    if (this.featureStore) {
      this.unsubscribeStore = this.featureStore.subscribe(() => {
        this.lifecycle.run(ctx).catch((error) => {
          console.error(`Error re-rendering "${path}" after a store change:`, error)
        })
      })
    }
  }

  currentPath(): string {
    return this.currentRoute
  }
}
```

`.catch()` with `console.error` matches the existing error-handling precedent in `DefaultUIEventBus.emit()` (`data/core/event_bus.ts:9-14`) — a subscription callback is synchronous void-returning; there's no caller waiting on the resulting promise to propagate an error to, so log-and-swallow is the only sensible option, same reasoning already applied there.

Because `DefaultComponentRegistry.get()` memoizes the resolved `Component` instance per tag (`component_registry.ts:23-42`), each re-run of `lifecycle.run(ctx)` calls `render()`/`update()` on the **same** component instance — the component reads fresh state directly off `ctx.store.state.value` each time it's invoked, no stale-closure risk.

## Known limitations (disclosed, not papered over)

- **Full pipeline re-run, not just `Update`.** Every store change re-runs `ResolveStep`/`MountStep` too, not just `RenderStep`/`UpdateStep`. Harmless for the shipped `NoopRuntimeAdapter` (its `mount()` is a no-op) and for `DefaultComponentRegistry` (memoized, so no re-construction cost) — but a **custom** `RuntimeAdapter` whose `mount()` has side effects (e.g. registering something) would have those side effects repeat on every store change. Not a problem today since only the noop adapter ships; flagged for whoever builds the next one.
- **Coarse-grained.** Any change to the store re-renders the current view, regardless of whether the view actually reads the part of state that changed. Acceptable for a first cut; revisit if a real app shows this is too expensive.
- **One active subscription at a time**, matching `DefaultRouter`'s existing single-current-route model — not a new limitation this ADR introduces, just inherited from what's already there.

## Acceptance criteria

- [ ] `DefaultRouter.navigate()` subscribes to `this.featureStore` (when present) after a successful navigation, and unsubscribes the previous route's subscription first
- [ ] Test: `store.dispatch()` called after `navigate()` (not through the router) results in the mounted component's `render()` being called again, against the same DOM element, verified via `happy-dom`
- [ ] Test: navigating to a **different** route stops the previous route's component from re-rendering on further store changes (subscription cleanup verified, not just assumed)
- [ ] Test: an error thrown inside a store-triggered re-render is logged, not left as an unhandled rejection
- [ ] No regression to ADR-0002/ADR-0003's existing tests

## Relates to

- ADR-0003 (`docs/adr/ADR-0003-data-layer-wiring.md`) — the Scope section that deferred this
- justweb#52 — the per-component prop/state reactivity this ADR deliberately doesn't touch or duplicate
