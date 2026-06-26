# ADR-0001: JustJS architecture

- **Status:** Active
- **Date:** 2026-06-26

## Summary

JustJS is the UI domain layer. Write a `*_component.yaml`. Place an HTML tag.
Everything else flows — routing, auth, state, API transport, lifecycle, CSS,
observability, platform delivery.

## Layer model

```
Network  →  Transport  →  Application  →  Data
              Aspects woven across all layers via JustJS.boot()
```

## Package map

| Package | Layer | Status |
|---|---|---|
| `@justjs/core` | Domain contracts — zero deps | Active |
| `@justjs/browser` | All four layers, browser runtime | Active |
| `@justjs/native` | Native adapter | Blocked |
| `@justjs/mobile` | Mobile adapter | Blocked |
| `@justjs/desktop` | Desktop adapter | Blocked |

## Layer pattern (SAF — Service Abstraction Framework)

Every package follows four layers:

| Directory | Name | Role |
|---|---|---|
| `api/` | Contracts | Interfaces, errors, types — zero dependencies |
| `core/` | Implementations | Business logic — never imported by consumers |
| `saf/` | Service Abstraction Facade | Only public surface — the sole import entry point |
| `spi/` | Service Provider Implementation | Extension hooks — external providers self-register here |

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

- `strategy` is resolved through the SPI (Service Provider Implementation) `AspectRegistry` — never imported directly
- All targets validated at boot time against `routes.gen.json` and `registry.gen.ts`
- Unknown strategy, route, or component tag = `BootError` before any layer starts
