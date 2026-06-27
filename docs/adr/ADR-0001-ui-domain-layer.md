# ADR-0001: JustJS architecture

- **Status:** Active
- **Date:** 2026-06-26

## Summary

JustJS is the UI domain layer. Write a `*_component.yaml`. Place an HTML tag.
Everything else flows — routing, auth, state, API transport, lifecycle, CSS,
observability, platform delivery.

## Layer model

Modelled on the OSI stack. Each layer has a single responsibility and depends
only on layers below it. Data flows upward: network → transport → application → data.

```
┌──────────────────────────────────────────────────────┐
│  data         FeatureStore · Signals · UIEventBus     │
├──────────────────────────────────────────────────────┤
│  application  Router · ComponentRegistry              │
│               Lifecycle · InteractionProxy            │
├──────────────────────────────────────────────────────┤
│  transport    ApiAdapter · WsAdapter · CacheAdapter   │
├──────────────────────────────────────────────────────┤
│  network      fetch · WebSocket · Service Worker      │
│               Custom Elements                         │
└──────────────────────────────────────────────────────┘
```

## AOP — cross-cutting concerns

A concern lives in `aop/` when it must operate at **more than one layer**. Placing
it inside a single layer would either leak implementation upward or force layers
to depend on concerns they should not know about — violating the OSI constraint.

| Concern | network | transport | application | data |
|---|---|---|---|---|
| security | token refresh | auth headers | route guards | — |
| observability | request timing | call logs | lifecycle events | state change tracking |
| i18n | — | locale file loading | render-time translation | locale state |
| flags | — | config fetch | component / route gating | flag state |
| analytics | — | event dispatch | interaction capture | — |
| theming | — | token file loading | CSS application | theme state |

Each AOP concern is woven at boot time by strategy name via the SPI `AspectRegistry`.
No layer imports an AOP concern directly — the concern is injected from the outside.

Errors are **not** an AOP concern. Each layer's `api/` defines its own specific
error types.

## Workspace layout

Every workspace in this repository is a **standalone workspace** — installable,
buildable, testable, and runnable in complete isolation. `bun-workspace.yaml` at
the repo root is a convenience only; nothing depends on it to function.

```
justjs/
  network/scm/main/src/{api,core,saf,spi}
  transport/scm/main/src/{api,core,saf,spi}
  application/scm/main/src/{api,core,saf,spi}
  data/scm/main/src/{api,core,saf,spi}

  aop/
    security/scm/main/src/{api,core,saf,spi}
    observability/scm/main/src/{api,core,saf,spi}
    i18n/scm/main/src/{api,core,saf,spi}
    flags/scm/main/src/{api,core,saf,spi}
    analytics/scm/main/src/{api,core,saf,spi}
    theming/scm/main/src/{api,core,saf,spi}

  platform/
    native/scm/main/src/{api,core,saf,spi}    ← blocked: justweb#43
    mobile/scm/main/src/{api,core,saf,spi}    ← blocked: justweb#43
    desktop/scm/main/src/{api,core,saf,spi}   ← blocked: justweb#43

  justscript/scm/main/src/{api,core,saf,spi}

  docs/
  bun-workspace.yaml
  package.json
```

## SAF — Service Abstraction Framework

Every workspace — OSI layer, AOP concern, platform adapter, or utility library —
follows the same four-directory layout under `scm/main/src/`. This is a hard
invariant. No workspace is exempt.

| Directory | Name | Role |
|---|---|---|
| `api/` | Contracts | Interfaces, errors, types — zero dependencies |
| `core/` | Implementations | Business logic — never imported by consumers |
| `saf/` | Service Abstraction Facade | Sole public export surface |
| `spi/` | Service Provider Implementation | Extension hooks — providers self-register here |

### Structure invariants

These are the verifiable conditions that must hold for every workspace before sign-off.

| # | Invariant | How to verify |
|---|---|---|
| S1 | `package.json` exists at `<workspace>/scm/main/` | file exists |
| S2 | `tsconfig.json` exists at `<workspace>/scm/main/` | file exists |
| S3 | `src/` exists at `<workspace>/scm/main/` | dir exists |
| S4 | `src/api/` exists | dir exists |
| S5 | `src/core/` exists | dir exists |
| S6 | `src/saf/` exists | dir exists |
| S7 | `src/saf/index.ts` exists | file exists — **error** if absent |
| S8 | `src/spi/` exists | dir exists — warning if absent |
| S9 | `package.json` name matches `^@justjs/` (or `^@justscript/` for justscript) | json key |
| S10 | `package.json` declares `"type": "module"` | json key |
| S11 | `package.json` declares `build`, `typecheck`, `test` scripts | json keys |
| S12 | `api/` contains no `index.ts` barrel | glob absence |
| S13 | `core/` contains no `index.ts` barrel | glob absence |
| S14 | `api/` files contain no imports from `core/`, `saf/`, or `spi/` | grep absence |
| S15 | `core/` files contain no imports from `saf/` | grep absence |
| S16 | `spi/` files contain no imports from `saf/` | grep absence |
| S17 | Workspace builds and tests in isolation: `bun install && bun run build && bun test` | manual run |

## App layout

`★` = hand-written input · `⚙` = generated output · `◎` = generated once, then owned by the developer.

### Single package (`justw generate app --preset sea`)

One `main/` — all features colocated under a shared `api/`, `core/`, `saf/`.

```
scm/
├── pub/
│   ├── openapi.json                       ⚙ merged OpenAPI spec
│   ├── dom-address-map.json               ⚙ stable DOM addresses
│   └── api.html                           ⚙ generated API docs
└── main/
    └── src/
        ├── api/
        │   └── <name>/
        │       └── types/
        │           ├── <name>_component.yaml       ★ component spec
        │           ├── <name>_api.yaml             ★ API contract
        │           ├── index.ts                    ⚙ barrel re-export
        │           ├── <name>_component.gen.ts     ⚙ Web Component class
        │           ├── <name>_component.gen.css    ⚙ scoped CSS
        │           ├── <name>_types.gen.ts         ⚙ domain types
        │           ├── <name>_api.gen.ts           ⚙ typed HTTP client
        │           ├── <name>_api_mock.gen.ts      ⚙ mock HTTP client
        │           ├── <name>_mock.gen.ts          ⚙ component mock
        │           ├── <name>_int_test.gen.ts      ⚙ integration test stub
        │           ├── <name>_e2e_test.gen.ts      ⚙ e2e test stub
        │           └── <name>_browser_test.gen.ts  ⚙ browser test stub
        ├── core/
        │   ├── app.ts                     ◎ JustJS.boot() lives here
        │   ├── registry.gen.ts            ⚙ custom element registration
        │   ├── api-runtime.ts             ⚙ shared fetch/retry/auth plumbing
        │   └── install_mocks.gen.ts       ⚙ dev-mode mock bootstrap
        └── saf/
            └── index.ts                   ◎ public re-export surface (seeded once)
src/
└── shared/
    └── browser-sdk/                       ⚙ browser automation SDK
```

### Multi-package (`justw generate app --preset sea-multi` — planned)

Each feature is a self-contained package with its own `main/src/{api,core,saf}` —
mirroring the domain package pattern used in the backend (e.g. `domain/llm/{agents,complete,prompt}`).
Shared wiring (app bootstrap, openapi, dom-address-map) lives in a `shared/` package.

```
scm/
├── <feature>/                         one directory per feature/package
│   └── main/
│       └── src/
│           ├── api/
│           │   └── <feature>/
│           │       ├── errors/
│           │       ├── traits/
│           │       └── types/
│           │           ├── <feature>_component.yaml   ★ component spec
│           │           ├── <feature>_api.yaml         ★ API contract
│           │           └── <feature>_types.gen.ts     ⚙ domain types
│           ├── core/
│           │   └── <feature>/
│           │       ├── <feature>_component.gen.ts     ⚙ Web Component class
│           │       ├── <feature>_component.gen.css    ⚙ scoped CSS
│           │       ├── <feature>_api.gen.ts           ⚙ typed HTTP client
│           │       └── <feature>_api_mock.gen.ts      ⚙ mock HTTP client
│           └── saf/
│               └── <feature>/
│                   └── index.ts                       ⚙ public re-export surface
└── shared/
    └── main/
        └── src/
            ├── core/
            │   ├── app.ts                ◎ JustJS.boot() lives here
            │   ├── registry.gen.ts       ⚙ custom element registration
            │   ├── api-runtime.ts        ⚙ shared fetch/retry/auth plumbing
            │   └── install_mocks.gen.ts  ⚙ dev-mode mock bootstrap
            └── pub/
                ├── openapi.json          ⚙ merged OpenAPI spec
                ├── dom-address-map.json  ⚙ stable DOM addresses
                └── api.html             ⚙ generated API docs
```

## DDAS — Deterministic DOM Addressing System

`dom-address-map.json` is a `DdasMap` artifact produced by `justw generate app` via `@swelabs/ddas`. It assigns every addressable DOM element a stable four-segment ID: `app:feature:component:element`.

JustJS consumes `dom-address-map.json` at two points:

| Point | Layer | What happens |
|---|---|---|
| Boot time | application | `BootValidator` calls `DomProcessor.validate()` — rejects any component tag in `.on([])` / `.except([])` that has no entry in the map |
| Lifecycle | application | `MountStep` resolves the DDAS ID to locate the correct DOM target before calling `RuntimeAdapter.mount()` |

The `application` workspace declares `@swelabs/ddas` as a runtime dependency. No other workspace imports it directly.

**`DdasMap` shape (from `@swelabs/ddas`):**

```typescript
// Flat record keyed by four-segment DDAS ID: app:feature:component:element
type DdasMap = {
  app:      string
  version:  string
  schema:   string
  elements: Record<string, ElementDescriptor>
  slots?:   Record<string, SlotDescriptor>
}
```

ID grammar: each segment matches `^[a-z0-9][a-z0-9-]*$`. `DomProcessor.load()` rejects maps that violate the grammar in strict mode.

## Signals

`FeatureStore` and `Signal<T>` are implemented with `@preact/signals-core`. When TC39 native signals ship, only the import in generated component files changes — the `FeatureStore` and `Signal` contracts stay the same.

## Boot contract

```typescript
JustJS.boot({
  routes,    // routes.gen.json   — valid route paths
  importmap, // importmap.gen.json — ES module import map
  registry,  // registry.gen.ts   — valid component tags
  domMap,    // dom-address-map.json — DdasMap (valid DOM addresses)

  // AOP — declared by strategy name, resolved via SPI, never imported directly
  security:     { strategy: "oauth",   on: ["/dashboard"] },
  observability:{ strategy: "datadog", all: true },
  i18n:         { strategy: "fluent",  all: true },
  flags:        { strategy: "launchdarkly", all: true },
  analytics:    { strategy: "segment", all: true },
  theming:      { strategy: "tokens",  all: true },

  // Custom AOP — open SPI contract
  aspects: [
    { strategy: "my-plugin", on: ["js-checkout"] }
  ]
})
```

AOP providers self-register before `boot()` is called:

```typescript
JustJS.providers.register({
  concern:  "security",
  strategy: "oauth",
  factory:  (config) => new OAuthProvider(config)
})
```

**Boot-time validation — hard invariant:**

`BootValidator` runs before any layer initialises. All four checks must pass:

1. Every strategy name is registered in `JustJS.providers`
2. Every route in `.on([])` / `.except([])` exists in `routes.gen.json`
3. Every component tag in `.on([])` / `.except([])` exists in `registry.gen.ts`
4. Every component tag in `.on([])` / `.except([])` has a valid DDAS entry in `dom-address-map.json`

Failure = `BootError` with an actionable message — what was expected, what is known, nearest match:

```
BootError: route "/cheackout" not found in routes.gen.json
           Known routes: /home, /checkout, /dashboard, /account
           Did you mean "/checkout"?
```

Unknown strategy, route, component tag, or DDAS address = `BootError` before any layer starts.

## Build-time tooling

The following features require a build-time tooling workspace not yet defined in the workspace layout. Their location is an open decision:

| Feature | Candidate location |
|---|---|
| Vite plugin + HMR | separate `tooling/vite/` workspace |
| SSR — Declarative Shadow DOM + client hydration | application layer or separate `tooling/ssr/` |
| Build pipeline — bundle + inline `importmap.gen.json` | separate `tooling/build/` workspace |
| Semver contract with justweb artifact shape | spec document, not a workspace |

These are tracked in issues #11–#14. The workspace location must be decided before implementation begins.
