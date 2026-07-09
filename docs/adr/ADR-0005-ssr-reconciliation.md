# ADR-0005: Reconciling `@justjs/ssr`'s `ComponentDefinition` with `@justjs/application`'s `Component`

- **Status:** Implemented (justjs#63)
- **Date:** 2026-07-09

## Summary

`@justjs/ssr` and `@justjs/application` each describe "a component" with an incompatible contract, and nothing connects them. `@justjs/ssr`'s `ComponentDefinition` (`api/component.ts`) is:

```ts
export interface ComponentDefinition {
  renderShadowDom(props: ComponentProps): string
  renderSlots?(slots: readonly ComponentSlot[]): string
}
```

— pure string templating, no DOM. `@justjs/application`'s `Component` (`api/component.ts`) is:

```ts
render(props: Props, element: Element, ctx?: ComponentDataContext): void | Promise<void>
```

— DOM mutation in place, driven by `RenderStep`/`UpdateStep`/`DefaultLifecycle`/`DefaultRouter` (ADR-0002/0003/0004). A developer who wants server-rendered initial HTML for a route currently has to hand-write a second, parallel implementation of the same component against `ComponentDefinition`, kept in sync by hand with whatever the real `Component`/justweb-generated custom element renders — or skip SSR entirely.

Telling detail: `tooling/ssr/scm/main/package.json` already declares `@justjs/application` as a runtime dependency, but no file in `tooling/ssr/scm/main/src` imports anything from it. The reconciliation this ADR designs was evidently anticipated once and never finished — this is that follow-through.

## Scope

**In scope:** how a single component definition produces both server-rendered HTML (via `@justjs/ssr`) and a live, mounted DOM node (via `@justjs/application`'s `Lifecycle`), without maintaining two hand-written implementations.

**Out of scope, not guessed at:**
- Streaming SSR, partial hydration, islands architecture — nothing in either package does any of this today; not introduced here.
- Fine-grained hydration diffing (React-style "resume" without a full re-render) — see Decision below for what actually happens on first client render.
- Any change to justweb's own per-component prop/state reactivity (justweb#52) — untouched.
- SSR of the ADR-0004 store-subscribed reactive re-render — explicitly addressed as "doesn't apply" in Consequences, not designed as a feature.

## How a component actually gets mounted today (the part SSR has to match)

`adaptCustomElementRegistry` (`core/registry/component_registry_adapter.ts`) is what `boot()` uses to bridge justweb's generated `LazyCustomElementRegistry` (`Record<tag, () => Promise<CustomElementConstructor>>`) into a `Component` `RenderStep` can call:

```ts
render(renderProps, container): void {
  const existing = container.firstElementChild
  const reusable = existing instanceof ElementCtor
  const element = reusable ? existing : new ElementCtor()
  // ...set/remove attributes from renderProps...
  if (!reusable) container.replaceChildren(element)
}
```

The important part for this ADR: **it already reuses an existing child if it's an instance of the right class, instead of always reconstructing.** A browser that parses HTML containing a defined custom element (including one inside a declarative shadow DOM `<template shadowrootmode="open">`) upgrades it to a real instance of its registered class before any script runs. So if `@justjs/ssr` renders the container with the real custom element already inside it, `container.firstElementChild instanceof ElementCtor` is **already true** by the time `boot()` calls `navigate()` — the existing reuse branch fires, attributes are set on the already-parsed element, and nothing is torn down and rebuilt. This reuse path was built for justweb#52 (repeated re-renders of an already-mounted element), not for SSR — but it happens to be exactly the mechanism SSR-then-hydrate needs, with no changes required to `RenderStep` or the adapter itself.

What's missing is only the server side: something has to construct the *same* `ElementCtor`, drive its real render logic, and serialize the result — without a developer hand-writing a second `renderShadowDom(props): string` that duplicates the generated class's actual logic.

## Decision

Retire `ComponentDefinition.renderShadowDom(props): string` as the thing a developer writes by hand. Replace it with a renderer that constructs the **real** custom element class server-side and reads back what it produced:

1. `@justjs/ssr` takes a `LazyCustomElementRegistry` entry (the same shape `adaptCustomElementRegistry` already consumes) instead of a hand-written `ComponentDefinition`.
2. The renderer assumes a DOM implementation (`document`/`HTMLElement`/`customElements`) already exists as a global — it does not register or manage one itself:
   - awaits the lazy `() => Promise<CustomElementConstructor>` loader to get the real class
   - self-registers it via `customElements.define(tag, ElementCtor)` (guarded against double-definition) — see the discovery under Consequences on why this is explicit rather than assumed
   - constructs `new ElementCtor()`, sets `props` as attributes (mirroring exactly what `adaptCustomElementRegistry`'s `render()` does client-side)
   - appends it to a connected container so `connectedCallback` fires and the class's own generated render logic runs
   - reads back `element.shadowRoot?.innerHTML ?? ""` as the shadow DOM string to serialize

   A real SSR process registers a DOM implementation once at startup (e.g. `@happy-dom/global-registrator`, staying a `@justjs/ssr` devDependency — used by this package's own tests only, exactly as `@justjs/application` already does it). Managing register/unregister *inside* `renderComponent()` per call was considered and rejected: two concurrent renders in the same process would then corrupt each other's global DOM state. Requiring the caller to own a single, already-running DOM environment is the same tradeoff this repo already made for `@justjs/application`'s own tests, just pushed out to whoever embeds `@justjs/ssr` in a real server.
3. `renderComponent()`/`renderDeclarativeShadowDom()` (`core/renderer.ts`) keep their existing string-templating/escaping/declarative-shadow-DOM-wrapping logic unchanged — only where the `shadowDom` string comes from changes.
4. `ComponentDefinition`/`renderShadowDom` are removed from the public contract; `renderSlots` stays (light-DOM slot content is legitimately separate from what the custom element's own shadow DOM renders, and nothing above touches it).

```ts
// tooling/ssr/scm/main/src/api/component.ts (after)
export interface ComponentSlot {
  readonly name: string
  readonly content: string
}
// ComponentDefinition removed — renderComponent() below takes an ElementCtor loader instead

// tooling/ssr/scm/main/src/core/renderer.ts (after)
export async function renderComponent(
  tag: string,
  load: () => Promise<CustomElementConstructor>,
  props: ComponentProps = {},
  slots: readonly ComponentSlot[] = []
): Promise<RenderedComponent> {
  // construct via happy-dom, set props as attributes, read back shadowRoot.innerHTML
  // — see Consequences for what happens when a class has no shadow root at all
}
```

Client-side, nothing changes: `boot()` → `adaptCustomElementRegistry` → `RenderStep` already reuses a pre-upgraded element via the `instanceof` check. This ADR adds no new hydration-specific code path in `@justjs/application` — the existing reuse logic *is* the hydration mechanism, once SSR output and client boot agree on the container shape (a DDAS-addressed container element wrapping the custom element, matching what `adaptCustomElementRegistry` expects to find).

## Alternative considered: keep `ComponentDefinition` string-based, add a hydration adapter instead

Keep `renderShadowDom(props): string` as a separate hand-written contract, and instead teach `@justjs/application` to accept pre-rendered HTML as a starting DOM state before `Lifecycle.run()` takes over.

Rejected: this still requires a developer (or codegen) to keep a second implementation of "what this component renders" in sync with the real generated class by hand, which is the actual problem, not a detail of which side does the reconciling. It would also need genuinely new code in `@justjs/application` (a hydration-aware mount path), where the chosen Decision needs none — the reuse-by-`instanceof` behavior already exists and already does the right thing once SSR emits matching markup.

## Build order

| # | Phase | Depends on | New/changed files |
|---|---|---|---|
| 1 | Add `@happy-dom/global-registrator` as a `@justjs/ssr` devDependency (its own tests need a DOM to construct real classes against) | — | `tooling/ssr/scm/main/package.json` |
| 2 | Rewrite `renderComponent()` to accept a `LazyCustomElementRegistry` entry, construct the real class against whatever DOM global the caller has registered, and read back `shadowRoot.innerHTML` | 1 | `tooling/ssr/scm/main/src/core/renderer.ts` |
| 3 | Remove `ComponentDefinition`/`renderShadowDom` from the public contract; update `saf/index.ts`'s exports | 2 | `tooling/ssr/scm/main/src/api/component.ts`, `tooling/ssr/scm/main/src/saf/index.ts` |
| 4 | End-to-end test: a real justweb-shaped `CustomElementConstructor` loader renders identical shadow DOM content via `@justjs/ssr` and via `boot()` → `navigate()` in `@justjs/application`, and the client-side `render()` call reuses (not replaces) the server-rendered element when both run against the same container markup | 3 | `tooling/ssr/scm/main/src/tests/hydration_int_test.ts` |

## Acceptance criteria

- [x] `@justjs/ssr` renders a component by constructing its real `CustomElementConstructor` (via the same `LazyCustomElementRegistry` shape `adaptCustomElementRegistry` consumes), not a hand-written parallel `ComponentDefinition`
- [x] `ComponentDefinition`/`renderShadowDom` no longer exist in `@justjs/ssr`'s public API
- [x] Test: the same `CustomElementConstructor` produces byte-identical (or semantically-equivalent, if whitespace differs) shadow DOM content whether rendered via `@justjs/ssr`'s `renderComponent()` or via a real `boot()` → `navigate()` client render (`test_render_constructs_the_real_class_not_a_hand_written_duplicate`, `renderer_int_test.ts`)
- [x] Test: after SSR output's custom element is parsed/upgraded into a real DOM (via `happy-dom`) and `adaptCustomElementRegistry`'s `render()` runs against that same container, its existing reuse branch fires — the pre-parsed element instance is reused (`container.firstElementChild` is unchanged, `container.replaceChildren()` is never called), not torn down and reconstructed (`hydration_int_test.ts`). (Scope note: `happy-dom` doesn't hoist `<template shadowrootmode="open">` into a real shadow root the way a browser does — see Consequences — so this test proves DOM-node reuse, not that the server-rendered shadow *content* survives without the class's own `connectedCallback` re-running.)
- [x] `renderSlots`/light-DOM slot content behavior is unchanged (default slot wrapping still applies; the customizable `ComponentDefinition.renderSlots` hook is gone along with the rest of `ComponentDefinition` — nothing in this repo used it beyond this package's own tests)
- [x] No regression in `@justjs/ssr`'s existing declarative-shadow-DOM-wrapping/escaping tests

## Consequences

- `@justjs/ssr` gains a genuine (finally-used) dependency on `@justjs/application`'s `LazyCustomElementRegistry` type for the loader shape, and `@happy-dom/global-registrator` becomes a real, used devDependency (for its own tests) rather than an unused runtime one.
- `renderComponent()` now requires the caller to have a DOM implementation already registered globally (`document`/`HTMLElement`/`customElements`) — it is not usable in a plain Node/Bun process with no DOM at all. This is a real new requirement on any SSR server that adopts this package, not previously true when `ComponentDefinition.renderShadowDom` was a pure string function needing no DOM.
- A component with no shadow root at all (an `ElementCtor` that never calls `attachShadow`) renders empty shadow DOM content — same as today's manual-string contract would if a developer forgot to return anything; not a new failure mode.
- `happy-dom` (at least the version this repo pins) does not implement declarative-shadow-DOM parsing — setting `.innerHTML` to a string containing `<template shadowrootmode="open">` leaves it as an inert light-DOM `<template>` element rather than hoisting it into a real, attached shadow root, even though it does correctly upgrade the custom element tag to its registered class. Confirmed by hand before writing the hydration test (see that test's own comment). This means: (a) this repo's test suite cannot verify true zero-re-render hydration end-to-end, only DOM-node-identity reuse; (b) real browsers *do* implement this natively, so the actual runtime behavior in production is expected to be better than what's testable here — a real, disclosed gap between test coverage and the production claim, not a production limitation.
- SSR output is first-paint-only. It does not itself react to `FeatureStore` changes (ADR-0004) — that reactivity is `DefaultRouter`'s job, and only starts once `boot()`/`navigate()` runs client-side and (per the reuse path above) adopts the server-rendered element. A component's own justweb#52 signal-based internal reactivity is unaffected either way — it lives inside the class itself, constructed identically on server and client.
- This is a breaking change to `@justjs/ssr`'s public API (`ComponentDefinition` removed) — acceptable since nothing in this repository currently constructs a real `ComponentDefinition` outside its own tests (confirmed: no cross-package caller exists yet), so there is no external consumer to migrate.
- **Discovered while implementing, not introduced by this ADR:** constructing a real, un-pre-registered autonomous custom element class via `new ElementCtor()` throws `TypeError: Illegal constructor` against a real DOM (confirmed against `happy-dom`) unless `customElements.define(tag, ElementCtor)` has already run for that class. `adaptCustomElementRegistry` (`application/core/registry/component_registry_adapter.ts`, shipped in ADR-0002/justjs#56) does exactly `new ElementCtor()` with no `customElements.define()` call of its own, and — until this ADR's `hydration_int_test.ts` — had never been tested against a real `HTMLElement` subclass; its own test suite (`component_registry_adapter_int_test.ts`) only ever used plain, non-DOM `FakeCustomElement` stand-ins, which never exercise this failure path. This ADR's `renderShadowDomFor` works around it locally (self-registers before constructing), but `adaptCustomElementRegistry` itself still carries the same latent gap client-side, unfixed here since it's pre-existing ADR-0002 code, not part of this ADR's scope — flagged for its own follow-up issue.

## Relates to

- ADR-0002 (`docs/adr/ADR-0002-boot-wiring.md`) — `adaptCustomElementRegistry`'s reuse-by-`instanceof` behavior, which this ADR depends on rather than duplicates
- ADR-0004 (`docs/adr/ADR-0004-reactive-rerender.md`) — the store-subscribed re-render this ADR explicitly does not extend to SSR output
- justjs#63 — the issue that requested this ADR
- justweb#52 — the per-component signal-based reactivity a server-constructed instance runs identically to a client-constructed one
