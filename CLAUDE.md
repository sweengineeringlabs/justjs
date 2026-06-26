# CLAUDE.md

## What JustJS is

JustJS is the UI domain layer — the frontend equivalent of what `edge-domain` is for the backend.

> _JavaScript components that just run in the browser._

The developer writes a `*_component.yaml` in justweb. Places an HTML tag. Everything else flows — routing, auth, state, API transport, lifecycle, CSS, observability, platform delivery — all for free.

## Architecture

See `docs/adr/ADR-0001-ui-domain-layer.md` and the full decision in `sweengineeringlabs/justweb` at `docs/3-design/adr/ADR-0004-justjs.md`.

### Four layers
- **Network** — raw browser APIs (fetch, WebSocket, Service Worker, Custom Elements)
- **Transport** — how data moves (ApiAdapter, WsAdapter, CacheAdapter)
- **Application** — component execution (Component, Lifecycle, Router, ComponentRegistry, InteractionProxy)
- **Data** — platform-agnostic state (FeatureStore, signals, UIEventBus)

### Aspects (cross-cutting, woven via SPI)
Security, Observability, i18n, Feature Flags, Analytics, Theming, and custom `JustJSAspect` plugins.

### SPI pattern
`JustJS.boot()` declares aspects by **strategy name** — never by importing an implementation. Providers self-register. Swap strategy name → nothing else changes.

### Boot-time validation (hard invariant)
Every route and component tag in `.on([])` / `.except([])` is validated against `routes.gen.json` and `registry.gen.ts` before any layer starts. Unknown target = `BootError`.

## Workspace layout

```
packages/
  core/     — @justjs/core    — domain contracts (interfaces only, zero deps)
  browser/  — @justjs/browser — browser runtime (all four layers + aspects)
  native/   — @justjs/native  — iOS/Android adapter (stub, blocked on justweb#43)
  mobile/   — @justjs/mobile  — mobile adapter (stub, blocked on justweb#43)
  desktop/  — @justjs/desktop — desktop adapter (stub, blocked on justweb#43)
docs/adr/   — architecture decisions
```

### SAF pattern (every package)
- `src/api/`  — TypeScript interfaces only, zero dependencies
- `src/core/` — implementations (never imported by consumers)
- `src/saf/`  — factory surface (only thing re-exported from package root)

## Commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Key invariants
- `@justjs/core` has zero runtime dependencies — interfaces only
- Consumers import from `@justjs/core` or `@justjs/browser` SAF surface only — never from `core/` or `api/` directly
- `JustJS.boot()` never imports an aspect implementation — SPI only
- Boot-time validation runs before any layer initialises — app never starts in invalid state
