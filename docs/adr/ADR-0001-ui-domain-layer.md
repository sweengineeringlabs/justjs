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

See justweb ADR-0004 (`docs/3-design/adr/ADR-0004-justjs.md`) — that document
is the source of truth for the generated app layout.

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
