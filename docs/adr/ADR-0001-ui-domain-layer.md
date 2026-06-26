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

After `justw generate app` the project follows the `full-stack` preset layout.
Theme is the top-level organiser under `scm/`. JustJS consumes artifacts from
each theme's `components/` and the shared wiring in `shared/core/`.

```
scm/
├── pub/
│   ├── openapi.json                  ⚙ merged OpenAPI spec
│   ├── dom-address-map.json          ⚙ stable DOM addresses
│   └── api.html                      ⚙ generated API docs
├── main/config/
│   ├── justweb.architecture.toml     ◎ codegen + structure config
│   └── application.toml              ◎ runtime config
├── <theme>/
│   ├── components/
│   │   ├── <theme>_component.yaml    ★ hand-written — component spec
│   │   ├── <theme>_component.gen.ts  ⚙ Web Component class
│   │   └── <theme>_component.gen.css ⚙ scoped CSS
│   ├── api/
│   │   ├── traits/
│   │   ├── types/
│   │   │   ├── <theme>_api.yaml          ★ hand-written — API contract
│   │   │   ├── <theme>_types.gen.ts      ⚙ domain types
│   │   │   ├── <theme>_api.gen.ts        ⚙ typed HTTP client
│   │   │   └── <theme>_api_mock.gen.ts   ⚙ mock HTTP client
│   │   ├── vo/
│   │   ├── errors/
│   │   └── events/
│   ├── handler/                      ◎ generated once per operationId
│   ├── core/
│   ├── spi/
│   └── tests/
└── shared/core/
    ├── app.ts                        ◎ generated once — JustJS.boot() lives here
    ├── inbound.ts                    ⚙ operationId → Handler wiring
    ├── registry.gen.ts               ⚙ custom element registration
    └── install_mocks.gen.ts          ⚙ dev-mode mock bootstrap
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
