# ADR-0001: JustJS architecture

- **Status:** Proposed
- **Date:** 2026-06-26
- **Source:** sweengineeringlabs/justweb ADR-0004 (`docs/3-design/adr/ADR-0004-justjs.md`)

This repository implements the architecture decided in justweb ADR-0004.
Read that document for the full rationale, layer model, dataflow diagrams,
SPI pattern, boot-time validation contract, and follow-up issues.

## Summary

JustJS is the UI domain layer — the frontend equivalent of what `edge-domain`
is for the backend. Write a `*_component.yaml` in justweb. Place an HTML tag.
Everything else flows.

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
| `@justjs/native` | Native adapter | Blocked on justweb#43 |
| `@justjs/mobile` | Mobile adapter | Blocked on justweb#43 |
| `@justjs/desktop` | Desktop adapter | Blocked on justweb#43 |

## App layout

`src/features/` is the default output directory justweb writes to for both
`by-feature` and `by-kind` presets (configurable via `features_dir` in
`justweb.toml`). Full layout in justweb ADR-0004.

```
my-app/
├── index.html                          ★ hand-written — place HTML tags
├── src/
│   ├── app.ts                          ◎ edited once — JustJS.boot() config
│   ├── registry.gen.ts                 ⚙ custom element registration
│   ├── routes.gen.json                 ⚙ route → component map
│   ├── importmap.gen.json              ⚙ ES module import map
│   ├── install_mocks.gen.ts            ⚙ mock adapter wiring
│   └── features/
│       └── checkout/
│           ├── checkout_component.yaml       ★ hand-written
│           ├── checkout_api.yaml             ★ hand-written
│           ├── index.ts                      ◎ scaffolded once — feature barrel
│           ├── checkout_component.gen.ts     ⚙ Web Component class
│           ├── checkout_component.gen.css    ⚙ scoped CSS
│           ├── checkout_types.gen.ts         ⚙ domain types
│           ├── checkout_api.gen.ts           ⚙ typed HTTP client
│           ├── checkout_api_mock.gen.ts      ⚙ mock HTTP client
│           ├── checkout_mock.gen.ts          ⚙ mock data fixtures
│           ├── checkout_browser_test.gen.ts  ⚙ browser test stub
│           ├── checkout_int_test.gen.ts      ⚙ integration test stub
│           └── checkout_e2e_test.gen.ts      ⚙ e2e test stub
└── public/
    └── openapi.json                    ⚙ merged OpenAPI spec (→ edge-domain)
```

The developer writes `*_component.yaml` and places HTML tags. The platform
author edits `app.ts` once. Everything else is generated.

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
