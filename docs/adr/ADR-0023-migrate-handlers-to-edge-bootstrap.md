# ADR-0023: Migrate justjs handlers to edge-bootstrap via the byte-ABI Wasm-component pathway (edge-js)

- **Status:** Proposed — not yet accepted, the open questions below need
  resolution before implementation starts
- **Date:** 2026-08-20

## Summary

Proposes migrating `justjs` handlers to run as real Wasm components hosted
by `sweengineeringlabs/edge-bootstrap` (a sibling Rust repo), using the
byte-ABI pathway `edge-bootstrap#26` already shipped, audited, and proved.
Working name for the migrated result: `edge-js`. Tracked as
[justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155)
(the implementation epic) and
[edge-bootstrap#62](https://github.com/sweengineeringlabs/edge-bootstrap/issues/62)
(the companion contract-extension issue on the `edge-bootstrap` side).

## Why justjs is a plausible migration target

`justjs` already self-describes as "the frontend equivalent of what
`edge-domain` is for the backend" (justjs#1) — its dispatch shape
(`Job -> Router -> Handler`, ingress/egress ports) was architected to mirror
`edge`'s own from the start. This is a migration onto an already-related
architecture, not a rewrite onto an unrelated one.

## What's already proven vs. what's not (verified by reading edge-bootstrap's own source, not assumed)

**Real and shipped, `edge-bootstrap#26`:** a TypeScript handler compiles via
`justc build --target wasm --component` into a real Wasm Component Model
artifact (`(component (core module ...) (canon lift ...))`), validated by
`DefaultComponentValidator` (zero component-level imports, the declared
`handler_export` present, contract version matches), and served through
`RuntimeBuilder::wasm_route()` — the exact same dispatch path
(`DefaultHttpJob`) a native Rust handler uses, no Wasm-specific
special-casing. Live-verified end to end via `edge-bootstrap`'s
`examples/edge-ts/` and `wasm_echo.rs`, not narrated.

**Real gaps, confirmed by reading `component_validator.rs` and
`examples/edge-ts/handler.ts`'s own doc comment, not assumed:**

- The byte ABI (`swe:edge-handler@0.2.0`) carries `list<u8>` only — no
  typed JSON/structured payload contract exists yet.
- `DefaultComponentValidator` hard-rejects any manifest that declares a
  capability at all — no granting mechanism exists. A handler needing
  `@justjs/network`/`cloud-connect` access cannot cross today.

Neither gap is hypothetical for this migration: most real `justjs`
handlers carry structured data, and several existing packages need real
external capabilities.

## Approach

Incremental, one real handler at a time — not a framework port.

**Phase 1 (no dependency on edge-bootstrap):** a new `@justjs/platform-edge`
adapter package, mirroring the existing `@justjs/platform-mobile` precedent
(adapts to an external runtime — `js-runtime`'s Android shell there,
`edge-bootstrap`'s `WasmtimeComponentEngine` here — without modifying it).
One narrow candidate handler (stateless, non-streaming, no external
capability) proven live end to end, matching exactly what
`examples/edge-ts/` already proves works.

**Phase 2 (gated on `edge-bootstrap#62`):** a typed-payload handler and a
capability-needing handler, once the contract is extended.

## Open questions (need resolution before implementation starts)

- Where are the compiled `.wasm`/`manifest.json` artifacts produced and
  consumed — a build step inside `justjs`'s own tooling, or a step on the
  `edge-bootstrap` side that pulls from a published `justjs` artifact? Not
  yet decided.
- Which specific `justjs` handler is the actual Phase 1 candidate? Not yet
  selected — needs a real audit against the stateless/non-streaming/
  capability-free bar.
- Is `@justjs/platform-edge` a permanent package, or scaffolding intended
  to be absorbed elsewhere once more of `justjs` migrates? Not yet decided.

## Scope

### Deliberately not decided here

- The typed-payload encoding convention and the shape of capability-
  granting — both are `edge-bootstrap#62`'s own open questions, on the
  `edge-bootstrap` side; this ADR doesn't make that design decision on its
  behalf.
- Whether all `justjs` handlers eventually migrate, or only a subset —
  out of scope; this ADR only commits to a Phase 1 proof.

### If pursued

- `@justjs/platform-edge` scaffolded, matching `@justjs/platform-mobile`'s
  SAF layout convention.
- One real, currently-shipping handler builds and serves live through a
  real `edge-bootstrap` `RuntimeBuilder`.

### Permanently out of scope (for this ADR)

- Streaming component invocation — deferred pending a decision on
  `edge-bootstrap` ADR-007's own flagged port/adapter architecture-revisit
  question (`edge-bootstrap#26` Delivery order item 7). Not folded into
  this decision.

## Acceptance criteria (for this ADR's own resolution, not implementation)

- [ ] Open questions above answered
- [ ] Phase 1 candidate handler selected
- [ ] justjs#155's Phase 1 tasks scoped/estimated against the selected
      handler

## Relates to

- [justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155) — the tracking epic this ADR backs
- `edge-bootstrap#26` — the byte-ABI pathway this builds on, complete on its own scope
- [edge-bootstrap#62](https://github.com/sweengineeringlabs/edge-bootstrap/issues/62) — the companion contract-extension issue gating Phase 2
- justjs#1 — the EPIC establishing justjs as edge-domain's frontend equivalent
- `@justjs/platform-mobile` (`platform/mobile/scm/main/`) — the adapter-package precedent this proposes mirroring
