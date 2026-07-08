# ADR-0002: Boot wiring — resolving aspects, connecting the OSI chain, driving the lifecycle from a real navigation

- **Status:** Proposed
- **Date:** 2026-07-08

## Summary

justjs#51 found that every layer/aspect in this repo is individually real and tested, but the connective tissue between them mostly doesn't exist in production code: `JustJS.boot()` validates and stops; `application` never imports `transport`/`network`/`data`; `DefaultRouter.navigate()` never triggers `DefaultLifecycle.run()`. This ADR designs the wiring that closes those gaps, and — because no prior doc in this repo (ADR-0001, architecture.md, or justweb's own ADR-0004) ever sequenced this work, only described the target end-state — proposes a concrete build order.

While grounding this design against the real types, two additional, previously-undocumented defects surfaced (D1, D5 below). Both are verified against the actual code, not inferred.

## Scope

**In scope:** `@justjs/application`'s own composition root (`boot()`), `transport`'s bridge to `network`, and `application`'s `Router`→`Lifecycle` connection.

**Out of scope:**
- `@justjs/data` (`FeatureStore`/`UIEventBus`) integration into the lifecycle. ADR-0004 (justweb)'s sequence diagram shows `ResolveStep` seeding `ctx.signals` from store selectors, but `ComponentContext` (`api/component.ts:11-15`) has no `signals` field today — adding one is a real API surface change to `ComponentContext` that deserves its own review, not a rider on this ADR. Tracked as a follow-up, not designed here.
- Reconciling with justweb's own generated `routes.gen.ts`, whose `renderCurrentRoute()` mounts via a direct `document.createElement` + `root.appendChild(element)` (justweb#54) — i.e. it does not call into `@justjs/application`'s `Router`/`Lifecycle` at all today. Whether justweb's generated router should eventually delegate to `@justjs/application`'s `Router` (matching ADR-0004's own diagram), or whether the two are legitimately separate routing concepts, is a cross-repo question for justweb's maintainers — noted under Open questions, not resolved here.
- `@justjs/platform-{native,mobile,desktop}` — blocked upstream on justweb#47, unaffected by this ADR.

## D1 — Prerequisite: reconcile `network`'s two `FetchAdapter` shapes

`network/api/adapter.ts` and `network/api/fetch.ts` each declare an unrelated `FetchAdapter` interface:

```ts
// api/adapter.ts — implemented by DefaultFetchAdapter
interface FetchAdapter { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }

// api/fetch.ts — re-exported as the public `FetchAdapter` type from saf/index.ts
interface FetchAdapter { fetch(request: FetchRequest): Promise<FetchResponse> }
```

`saf/index.ts` exports the *type* from `api/fetch.ts` and the *implementation* (`DefaultFetchAdapter`) from `core/fetch_adapter.ts`, which implements the *other* one. Verified, not hypothesized — assigning `new DefaultFetchAdapter()` to the publicly exported `FetchAdapter` type fails under `tsc --strict`:

```
error TS2322: Type 'DefaultFetchAdapter' is not assignable to type 'FetchAdapterB'.
  Type '(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>'
  is not assignable to type '(request: FetchRequest) => Promise<FetchResponse>'.
```

This is the same "two unreconciled shapes" failure mode justjs#38/#50 already found once in `application`'s registry — it recurs here in `network`, undiscovered until now because `osi-layers-integration` (the only place `DefaultFetchAdapter` is exercised) has no `tsconfig.json`/typecheck script, so `bun test` transpiles it without ever type-checking the mismatch. (Its test happens to pass at runtime — Bun's `fetch()` is lenient about the object literal it's handed — but that's incidental, not a guarantee.)

**Decision:** keep `api/fetch.ts`'s request/response shape as canonical — it's the one already re-exported publicly, and it structurally mirrors `transport`'s own `ApiRequest`/`ApiResponse` (D2 needs that impedance match). Delete `api/adapter.ts` entirely (its `FetchAdapter`, `WsAdapter`, `WsConnection`, `NetworkErrorCode`, and interface-shaped `NetworkError` are all unused duplicates of `api/fetch.ts`/`api/websocket.ts`'s versions — confirmed via grep, nothing outside `core/fetch_adapter.ts` imports from `api/adapter.ts`). Rewrite `DefaultFetchAdapter`:

```ts
// network/core/fetch_adapter.ts
import type { FetchAdapter, FetchRequest, FetchResponse } from "../api/fetch.js"

export class DefaultFetchAdapter implements FetchAdapter {
  async fetch(request: FetchRequest): Promise<FetchResponse> {
    const res = await globalThis.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    })
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      body: await res.text(),
      ok: res.ok,
    }
  }
}
```

This must land before D2, since `DefaultApiAdapter` needs a `FetchAdapter` it can actually call.

## D2 — `transport` implements `DefaultApiAdapter` for real

`transport/core/api_adapter.ts`'s `DefaultApiAdapter` is a `NOT_IMPLEMENTED` stub today. Constructor-inject the (now-reconciled) `FetchAdapter`, matching the DI pattern `DefaultLifecycle` already uses for `RuntimeAdapter`/`ComponentRegistry`:

```ts
export class DefaultApiAdapter implements ApiAdapter {
  constructor(private readonly fetchAdapter: FetchAdapter) {}

  async get<T>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({ url, method: "GET", ...options })
  }
  // post/put/delete follow the same shape, method fixed, body passed through

  private async request<T>(req: FetchRequest): Promise<ApiResponse<T>> {
    const res = await this.fetchAdapter.fetch(req)
    const contentType = res.headers["content-type"] ?? ""
    const data = contentType.includes("application/json") ? JSON.parse(res.body) : res.body
    return {
      status: res.status,
      data: data as T,
      headers: res.headers,
      error: res.ok ? undefined : res.statusText,
    }
  }
}
```

No cache-aside wrapping inside `DefaultApiAdapter` itself — `DefaultCacheAdapter` stays a separate, optional composition a caller adds (`new CachingApiAdapter(apiAdapter, cacheAdapter)` — not designed here, out of scope until something actually needs it; avoids building unused abstraction, per this project's own anti-pattern list).

## D3 — Fix `BootConfig.aspects`'s schema, then make `boot()` resolve + weave

Today `AspectConfig` (`api/boot.ts:13-16`) is `{ routes?, components? }` — no `strategy` field — while `BootValidator`'s AC1 check only validates a strategy name when `aspectConfig` is a bare **string**, and ADR-0001's own boot-contract example shows a third shape again (`{ strategy: "oauth", on: [...] }`, flat, no `routes`/`components` split). Three shapes, none matching. Verified by reading `boot.ts:220-240` against `api/boot.ts:13-16` directly — not inferred.

**Decision:** keep the current split representation (`routes.on`/`except`, `components.on`/`except`) — it's already implemented and tested, and more precise than the ADR's flattened list (route paths and component tags validated against different known-sets). Add the missing field:

```ts
export interface AspectConfig {
  readonly strategy: string
  readonly routes?: RouteConfig
  readonly components?: ComponentConfig
}
```

Drop the bare-string shorthand from `BootValidator`'s AC1 (dead code path once every `AspectConfig` always carries `strategy`). Update ADR-0001's boot-contract example to match (`security: { strategy: "oauth", routes: { on: ["/dashboard"] } }`) — the doc gets corrected to the code, consistent with how POC-CONTRACT-SPEC.md's own correction-note history has always resolved doc/code mismatches in this repo.

**`boot()` then actually weaves:**

```ts
async boot(config: BootConfig): Promise<void> {
  this.validator.validate(config, this)

  if (config.aspects) {
    for (const [concern, aspectConfig] of Object.entries(config.aspects)) {
      const spec = this.providers.resolve(concern, aspectConfig.strategy)
      if (!spec) continue // unreachable — validator already rejected unregistered strategies
      const aspect = spec.factory() as JustJSAspect
      aspect.weave({
        concern,
        routes: [...(aspectConfig.routes?.on ?? []), ...(aspectConfig.routes?.except ?? [])],
        components: [...(aspectConfig.components?.on ?? []), ...(aspectConfig.components?.except ?? [])],
      })
    }
  }

  this.buildRuntime(config) // D4
}
```

Every shipped aspect's `weave()` is still a no-op today (all default strategies are `"noop"`) — so this makes no *visible* behavior change yet. It closes the gap anyway: the moment a real strategy (`oauth`, `datadog`, etc.) is registered, `boot()` will actually invoke it, which today it structurally cannot.

## D4 — `boot()` becomes a real composition root

`BootConfig.registry` (validated today as a plain `{path, component}` map, for the route↔registry cross-check) is validation metadata — it is **not** the lazy-factory shape `DefaultComponentRegistry` or `adaptCustomElementRegistry` need. Building a real, runtime component registry needs a second field:

```ts
export interface BootConfig {
  // ...existing fields unchanged...
  readonly componentRegistry?: LazyCustomElementRegistry | ComponentRegistry
  readonly runtimeAdapter?: RuntimeAdapter   // defaults to NoopRuntimeAdapter
  readonly apiAdapter?: ApiAdapter           // defaults to new DefaultApiAdapter(new DefaultFetchAdapter())
}
```

```ts
private buildRuntime(config: BootConfig): void {
  const registry = config.componentRegistry
    ? ("register" in config.componentRegistry
        ? config.componentRegistry
        : adaptCustomElementRegistry(config.componentRegistry))
    : undefined

  this._apiAdapter = config.apiAdapter ?? new DefaultApiAdapter(new DefaultFetchAdapter())
  this._componentRegistry = registry
  this._lifecycle = new DefaultLifecycle(config.domAddressMap, config.runtimeAdapter, registry)
  this._router = new DefaultRouter(config.routes ?? [], config.registry ?? {}, this._lifecycle, config.domAddressMap)
}

get router(): Router { return this._router }
get lifecycle(): Lifecycle { return this._lifecycle }
get apiAdapter(): ApiAdapter { return this._apiAdapter }
```

This is what makes `application` a real, non-optional consumer of `@justjs/network`/`@justjs/transport` — `boot.ts` now statically imports `DefaultFetchAdapter` (network) and `DefaultApiAdapter` (transport) to build the default. `@justjs/data` is deliberately **not** added as a dependency here — nothing in this design consumes it (see Scope).

## D5 — `DefaultRouter.navigate()` drives the lifecycle, including the missing DDAS→Element step

Two things block this, both verified against real code:

1. `DefaultRouter` (`core/registry/router.ts:5-13`) only ever sets a private field — it has no reference to `Lifecycle`, `registry`, or `domAddressMap` today, so it structurally cannot drive anything.
2. Even with a reference, nothing in `application` converts a DDAS address string to a real DOM `Element`. `resolveDdasAddressesForTag` (`api/dom-address.ts:39-43`) returns address *strings* (e.g. `"app:feature:home:root"`); `MountStep.execute` (`lifecycle_pipeline.ts:31-59`) requires `ctx.element` to **already** be a populated `Element` and throws if it isn't — nothing populates it. justweb stamps `data-ddas-id="<address>"` on generated markup (confirmed via grep across justweb's `domcompiler`/`webschema` crates) — that's the missing link.

**Decision:** rewrite `DefaultRouter` to own this, and add the element lookup inline (not a new `LifecycleStep`, since it must run *before* `ComponentContext` can even be constructed — `ctx.element` is `readonly` and required at construction, not filled in mid-pipeline):

```ts
export class DefaultRouter implements Router {
  private currentRoute = "/"

  constructor(
    private readonly routes: readonly string[],
    private readonly registry: Record<string, { path: string; component: string }>,
    private readonly lifecycle: Lifecycle,
    private readonly domAddressMap?: DomAddressMap,
  ) {}

  async navigate(path: string): Promise<void> {
    if (!path.startsWith("/")) throw new RegistryError(`Route must start with /: ${path}`)

    const entry = Object.entries(this.registry).find(([, e]) => e.path === path)
    if (!entry) throw new RegistryError(`No registered component for route: ${path}`)
    const [tag] = entry

    const ddasIds = this.domAddressMap ? resolveDdasAddressesForTag(this.domAddressMap, tag) : []
    const element = ddasIds.length > 0
      ? document.querySelector(`[data-ddas-id="${ddasIds[0]}"]`)
      : document.querySelector(tag) // fallback: bare custom-element lookup, no DDAS map supplied

    if (!element) throw new RegistryError(`No DOM element found for route "${path}" (tag "${tag}")`)

    this.currentRoute = path
    await this.lifecycle.run({ tag, props: {}, element })
  }

  currentPath(): string { return this.currentRoute }
}
```

`props: {}` is a known gap, not papered over: dynamic-segment params (`/order/:id`) aren't threaded through yet — that needs the same route-matching justweb's own `routes.gen.ts` already does (path-to-params extraction), which `application`'s `Router` doesn't have today. Flagged under Open questions rather than designed on the spot — extracting params correctly deserves its own small design pass, not an inline guess.

## Open questions (not resolved by this ADR)

- Should `application`'s `Router` eventually be the thing justweb's generated `routes.gen.ts` delegates to, instead of each maintaining independent navigation/mounting logic? Cross-repo, needs justweb's maintainers.
- Dynamic route param extraction in `DefaultRouter.navigate()` (D5's `props: {}` gap).
- `@justjs/data` → `ComponentContext` integration (`ctx.signals`, per ADR-0004's original sequence diagram) — needs its own ADR once `ComponentContext`'s shape is up for revision.

## Build order

Each phase is independently shippable and testable — no phase requires a later one to typecheck or pass its own tests.

| # | Phase | Depends on | New/changed files |
|---|---|---|---|
| 1 | D1 — reconcile `FetchAdapter` shapes | — | `network/api/adapter.ts` (deleted), `network/core/fetch_adapter.ts` |
| 2 | D2 — real `DefaultApiAdapter` | 1 | `transport/core/api_adapter.ts` |
| 3 | D3 — `AspectConfig.strategy` + boot resolve/weave | — (independent of 1/2) | `application/api/boot.ts`, `application/core/boot.ts`, `docs/adr/ADR-0001-ui-domain-layer.md` |
| 4 | D4 — boot composition root | 2, 3 | `application/api/boot.ts`, `application/core/boot.ts` |
| 5 | D5 — `Router` drives `Lifecycle` | 4 | `application/core/registry/router.ts`, `application/api/registry.ts`, `osi-layers-integration/src/tests/osi_layers_int_test.ts` |

Phases 1 and 3 can run in parallel; everything converges at 4.

## Consequences

- `@justjs/application` gains a real, non-optional dependency on `@justjs/network`/`@justjs/transport`'s concrete classes at `boot()`'s default-construction path (already declared in `package.json`, previously unused).
- `network`'s public `FetchAdapter` export changes shape (D1) — a breaking change for any external consumer already depending on the native-`fetch`-signature version, though grep found none inside this repo today.
- `ADR-0001`'s boot-contract example needs a follow-up edit once D3 lands (flattened `on`/`except` → split `routes`/`components`, `strategy` field added).
- `DefaultRouter`'s constructor changes from zero-arg to `(routes, registry, lifecycle, domAddressMap)` (D5) — breaks the one existing real call site, `osi-layers-integration/src/tests/osi_layers_int_test.ts:286` (`new DefaultRouter()`), which must be updated as part of phase 5, not left to fail. Caught only when directly checked against "is every phase actually independently shippable" — not disclosed in this ADR's first draft.
- No change to any shipped AOP strategy's *behavior* — every one is still `"noop"`. This ADR makes `boot()` capable of invoking a real strategy; it does not add one.

## Relates to

- justjs#51 — the issue this ADR designs a fix for.
- justjs#38/#39/#42–#50 — same "unreconciled duplicate shape" failure mode, previously found in the registry, now found again in `network` (D1).
- justweb#54/#48/#56 — DDAS stamping (`data-ddas-id`) and `tag`-based resolution this design depends on.
