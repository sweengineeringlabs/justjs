# ADR-0001: JustJS architecture

- **Status:** Active
- **Date:** 2026-06-26

## Summary

JustJS is the UI domain layer. Write a `*_component.yaml`. Place an HTML tag.
Everything else flows — routing, auth, state, API transport, lifecycle, CSS,
observability, platform delivery.

## Layer model

Modelled on the OSI stack — each layer has a single responsibility and depends
only on layers below it. Aspects are cross-cutting: they span all layers and are
woven at boot time, never imported directly.

```
┌─────────────────────────────────────────────────┐
│  Data         FeatureStore · Signals · UIEventBus│
├─────────────────────────────────────────────────┤
│  Application  Router · ComponentRegistry         │
│               Lifecycle · InteractionProxy        │
├─────────────────────────────────────────────────┤
│  Transport    ApiAdapter · WsAdapter · CacheAdapter│
├─────────────────────────────────────────────────┤
│  Network      fetch · WebSocket · Service Worker │
│               Custom Elements                    │
└─────────────────────────────────────────────────┘
         ↕ woven across all layers via JustJS.boot()
┌─────────────────────────────────────────────────┐
│  Aspects      Security · Observability · i18n    │
│  (cross-cutting) Flags · Analytics · Theming     │
│               Error Handling                     │
└─────────────────────────────────────────────────┘
```

## Workspace layout

Every layer and every aspect is a **standalone workspace** — installable,
buildable, testable, and runnable in complete isolation. The monorepo
`bun-workspace.yaml` is a convenience only; nothing depends on it to function.

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
    error-handling/scm/main/src/{api,core,saf,spi}

  platform/
    native/scm/main/src/{api,core,saf,spi}    ← blocked: justweb#43
    mobile/scm/main/src/{api,core,saf,spi}    ← blocked: justweb#43
    desktop/scm/main/src/{api,core,saf,spi}   ← blocked: justweb#43

  docs/
  bun-workspace.yaml
  package.json
```

## SAF — Service Abstraction Framework

Every workspace follows the same four-directory layout under `scm/main/src/`:

| Directory | Name | Role |
|---|---|---|
| `api/` | Contracts | Interfaces, errors, types — zero dependencies |
| `core/` | Implementations | Business logic — never imported by consumers |
| `saf/` | Service Abstraction Facade | Sole public export surface |
| `spi/` | Service Provider Implementation | Extension hooks — providers self-register here |

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

## Boot contract

```typescript
JustJS.boot({
  routes, importmap, registry,
  security:     { strategy: "oauth", on: ["/dashboard"] },
  observability:{ strategy: "datadog", all: true },
  aspects: [
    { strategy: "my-plugin", on: ["js-checkout"] }
  ]
})
```

- `strategy` is resolved through the SPI `AspectRegistry` — never imported directly
- All targets validated at boot time against `routes.gen.json` and `registry.gen.ts`
- Unknown strategy, route, or component tag = `BootError` before any layer starts
