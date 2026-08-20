# ADR-0023: justjs becomes an edge-bootstrap-hosted Handler (edge-js)

- **Status:** Proposed — not yet accepted, the open questions below need
  resolution before implementation starts
- **Date:** 2026-08-20 (corrected 2026-08-20 — see Correction below)

## Correction (2026-08-20, same day as initial version)

The initial version of this ADR assumed a pre-existing `Handler`
abstraction inside `justjs`, proposing to "audit and migrate one" from a
shortlist. **Verified against the real source and found wrong:**
`@justjs/application`'s real API (`Component`, `Router`, `RuntimeAdapter`)
is a client-side DOM component-mounting system, not a server-side
request/response dispatcher; `@justjs/network`/`@justjs/transport` are
outbound clients. A repo-wide search for any real `Handler` type/interface
in `justjs` returned zero results.

The real, buildable target — and why this ADR exists at all — is
different and simpler: `@justjs/ssr`'s `renderComponent()` (real, tested,
shipped in `justjs#12`) already has exactly the right shape,
`(tag, loader, props, slots) -> Promise<RenderedComponent>` —
request-shaped-in, response-shaped-out — but **has zero callers anywhere
in `justjs` today** outside its own tests. No request-to-render pipeline
exists yet. This ADR is about building that pipeline and wrapping it as
one Handler, not migrating something that already exists.

## Summary

Proposes making `justjs` itself an edge-bootstrap-hosted Handler: build
the request-to-render pipeline `justjs` doesn't have yet (resolve a
request's path via `@justjs/application`'s `Router`, render the matched
component via `@justjs/ssr`'s `renderComponent()`), wrap that pipeline as
a single Handler conforming to edge-bootstrap's `Handler` contract
(`execute(request) -> response`), compile it via `justc build --target
wasm --component`, and host it through `sweengineeringlabs/edge-bootstrap`'s
`RuntimeBuilder` — its full infrastructure (HTTP ingress, lifecycle,
config, observability), not just the byte-ABI hosting mechanism narrowly.
Client hydration (`renderDeclarativeShadowDom`, already shipped in
`justjs#12`) picks up unchanged in the browser; this ADR only changes how
the initial HTML is produced and served. Working name for the result:
`edge-js`. Tracked as
[justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155)
(the implementation epic) and
[edge-bootstrap#62](https://github.com/sweengineeringlabs/edge-bootstrap/issues/62)
(the companion contract-extension issue on the `edge-bootstrap` side).

## Why justjs is a plausible fit for this, not just any framework

`justjs` already self-describes as "the frontend equivalent of what
`edge-domain` is for the backend" (justjs#1) and its dispatch shape was
architected with `edge`'s own architecture in mind. That framing turned
out not to mean a literal matching `Handler` type exists (see Correction
above) — but the two real primitives this ADR wires together
(`Router` + `renderComponent()`) are exactly what a server-side render
pipeline needs, and both already exist, tested, real.

## What's already proven vs. what's not (verified by reading source, not assumed)

**Real and shipped, on the `edge-bootstrap` side (`edge-bootstrap#26`):** a
TypeScript handler compiles via `justc build --target wasm --component`
into a real Wasm Component Model artifact, validated by
`DefaultComponentValidator`, served through `RuntimeBuilder::wasm_route()`
— the same dispatch path a native Rust handler uses. Live-verified via
`edge-bootstrap`'s `examples/edge-ts/` and `wasm_echo.rs`.

**Real and shipped, on the `justjs` side:** `@justjs/ssr`'s
`renderComponent()`/`renderDeclarativeShadowDom` (`justjs#12`) and
`@justjs/application`'s `Router` (route resolution). Both real, tested,
used elsewhere — but never wired to each other, and never wired to an
inbound HTTP request. That wiring is what this ADR proposes building.

**Real gaps, on the `edge-bootstrap` side, confirmed by reading
`component_validator.rs` and `examples/edge-ts/handler.ts`'s own doc
comment:**

- The byte ABI (`swe:edge-handler@0.2.0`) carries `list<u8>` only. This
  does not block Phase 1 below — SSR output is HTML text, which fits
  `list<u8>` fine.
- `DefaultComponentValidator` hard-rejects any manifest declaring a
  capability at all — no granting mechanism exists. This blocks any route
  whose SSR render path needs to fetch real data via
  `@justjs/network`/`cloud-connect`.

## Approach

**Phase 1 (no dependency on edge-bootstrap#62):** pick the narrowest real
route/component that renders with zero data-fetching in its SSR path
(static content only). Build the request → `Router.resolve()` →
`renderComponent()` → HTML pipeline. Wrap it as one Handler. Compile via
`justc`. Host through a real `edge-bootstrap` `RuntimeBuilder`. Live-verify
a real HTTP request returns real server-rendered HTML, and that client
hydration still works against it unmodified.

**Phase 2 (gated on `edge-bootstrap#62`):** extend to a route whose SSR
render path fetches real data — requires the capability-granting
mechanism to land first.

## Open questions (need resolution before implementation starts)

- Which specific route/component is the actual Phase 1 candidate? Not yet
  selected — needs a real audit of `justjs`'s example apps for one that
  renders with zero SSR-time data fetching.
- Where do the compiled `.wasm`/`manifest.json` artifacts get produced and
  consumed — a build step inside `justjs`'s own tooling, or a step on the
  `edge-bootstrap` side? Not yet decided.
- Does the request→render→Handler wiring live in a new package (e.g.
  `@justjs/platform-edge`), or inside `tooling/ssr` itself? Not yet
  decided — unlike `@justjs/platform-mobile`, there's no established
  precedent to mirror here, since nothing like this has been built before.

## Scope

### Deliberately not decided here

- The typed-payload encoding convention and the shape of
  capability-granting — both are `edge-bootstrap#62`'s own open questions,
  on the `edge-bootstrap` side.
- Whether more than one route/page eventually migrates — out of scope;
  this ADR only commits to a Phase 1 proof.

### If pursued

- The request → `Router.resolve()` → `renderComponent()` → HTML pipeline,
  built new.
- That pipeline, wrapped as one Handler, serving a real HTTP request
  through a real `edge-bootstrap` `RuntimeBuilder`.

### Permanently out of scope (for this ADR)

- Streaming component invocation — deferred pending a decision on
  `edge-bootstrap` ADR-007's own flagged port/adapter architecture-revisit
  question (`edge-bootstrap#26` Delivery order item 7).

## Acceptance criteria (for this ADR's own resolution, not implementation)

- [ ] Open questions above answered
- [ ] Phase 1 candidate route/component selected
- [ ] justjs#155's Phase 1 tasks scoped/estimated against the selected
      route

## Relates to

- [justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155) — the tracking epic this ADR backs
- `edge-bootstrap#26` — the byte-ABI pathway this builds on, complete on its own scope
- [edge-bootstrap#62](https://github.com/sweengineeringlabs/edge-bootstrap/issues/62) — the companion contract-extension issue gating Phase 2
- justjs#1 — the EPIC establishing justjs as edge-domain's frontend equivalent
- justjs#12 — shipped the real `@justjs/ssr` primitives this ADR wires up
