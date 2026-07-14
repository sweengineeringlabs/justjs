# ADR-0007: `@justjs/connect-kit` — reusable control component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Split out from [ADR-0006](ADR-0006-connect-kit-view.md) to review the
stateful, higher-risk piece of `@justjs/connect-kit` independently:
`<control-provider-connect>`, a real Custom Element covering provider grid
-> tap -> credential form -> Connect -> resource list, replacing 6
independent hand-written implementations
(`workspace.ts`'s Cloud/SCM/PM, `communication.ts`, `socials.ts`,
`cartoon.ts`).

Package scaffold, SAF location, the general "why real Web Components,
nested not routed" design, and the low-risk `<view-provider-badge>`
element are decided in ADR-0006 — not repeated here.

This ADR does **not** propose retrofitting all 6 existing screens — see
[Migration strategy](#migration-strategy).

## Why this is a separate ADR from ADR-0006

A view component is pure presentation — properties in, markup out, no
internal state. This element is different in kind: it owns real state
(which provider is selected, loading, error) and dispatches events other
code reacts to. Its property/event surface is a real API contract other
code will depend on, and migrating an existing screen onto it (Socials)
carries real regression risk to already-passing `verify_web.mjs`
assertions. That's a higher-stakes decision than the view piece, worth
reviewing and accepting on its own — see ADR-0006's
"Why split view from control" section for the full reasoning.

## Real, counted duplication (evidence — full detail in ADR-0006)

Six independent implementations of the same grid -> detail -> connect-form
-> resource-list sequence, sharing CSS classes
(`.provider-grid`/`.provider-card`/`.connect-form`/`.connect-actions`/
`.connect-status`/`.resource-list`/`.resource-row`) but with zero shared
render/state logic: `workspace.ts` (Cloud, SCM, PM — 3 separate render
paths in one file), `communication.ts`, `socials.ts`, `cartoon.ts`.

## Scope

### In scope

`<control-provider-connect>` (`ProviderConnectControl`) — a real Custom
Element (`HTMLElement` subclass, `attachShadow({mode: "open"})`) covering
the **common case**: single- or two-field bearer-style credential form.
Configured via a `.providers` catalog property (id/name/icon/color/logo)
plus caller-supplied `.connect(config)` / `.list(session)` function
properties — the element renders and manages selection/loading/error
state internally and dispatches `CustomEvent`s (`connected`,
`resource-select`, `error`) for the host to react to; the caller supplies
the actual network calls (already implemented per-package in each
`*-connect` SAF). Composes `<view-provider-badge>` (ADR-0006) internally
for each provider-card icon.

### Out of scope, not guessed at

- **OAuth-redirect providers (Jira)** are a real, different flow (external
  redirect, URL callback parsing, no synchronous `connect()` return) and
  are explicitly NOT covered by v1. Jira's screen stays hand-written until
  a second real OAuth consumer exists to justify generalizing it — one
  example is not a pattern.
- **Billed-generate providers (Cartoon)** have a fundamentally different
  action shape (`generate()` behind a cost disclosure, not `list()`
  returning resources) and are explicitly NOT covered by v1. Cartoon's
  screen stays hand-written.
- Retrofitting all 6 existing screens onto this element in this same
  effort — only Socials migrates as part of this ADR; see Migration
  strategy.

## Design recap (decided in ADR-0006, applies here)

Real Web Component, Shadow DOM-encapsulated HTML/CSS, self-registers via
`customElements.define("control-provider-connect", ProviderConnectControl)`
as an import side-effect, no `x-*`/`js-*` vendor prefix, nested inside an
existing routed component's template rather than independently routed —
outside DDAS/boot-time validation entirely since it's never targeted by an
`AspectConfig`'s `.on([])`/`.except([])`. Full reasoning in ADR-0006.

## Migration strategy

1. Ship `<control-provider-connect>`, verified in isolation with its own
   test suite (jsdom/happy-dom-based Shadow DOM assertions, matching the
   harness `comms-connect` already proved out this session).
2. Migrate exactly **one** existing screen as the first real consumer —
   Socials (`socials.ts`), chosen because it has no OAuth provider and no
   generate/billing variant, making it the closest fit to this element's
   v1 scope. This proves the element end-to-end against a real screen
   without touching OAuth or billed-generate logic.
3. Migrate the remaining 5 screens opportunistically (next time each is
   touched for an unrelated reason), not as a dedicated sweep.

## Known limitations (disclosed, not papered over)

- v1 does not cover OAuth-redirect or billed-generate flows — Jira and
  Cartoon stay hand-written indefinitely unless a second real instance of
  either shape appears.
- Only one migrated consumer (Socials) will exist after this ADR's issues
  close — the other 5 screens keep their duplicated code until migrated
  individually.
- Moving to Shadow DOM means the existing `.provider-grid`/`.connect-*`/
  `.resource-*` rules in `app.css` need to be ported into this element's
  own `<style>` block — real work, and they can drift from the global
  copies until every screen migrates.
- `ProviderConnectControl`'s exact property/event surface is a design
  decision for the implementing issue, not fully fixed by this ADR — the
  grid/detail/form/list states are fixed, the precise config and event
  names are not.

## Acceptance criteria

- [ ] `<control-provider-connect>` ships with tests covering grid/detail/
      connect-form/resource-list states and its dispatched events,
      explicitly excluding OAuth and generate/billing variants
- [ ] Socials tab (`socials.ts`) migrated to consume
      `<control-provider-connect>` and `<view-provider-badge>`,
      `verify_web.mjs` passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-connect-kit-view.md) — package scaffold, shared
  Web Component design rationale, `<view-provider-badge>`
- ADR-0001 (workspace layout, SAF structure invariants)
- Tracked by justjs#97 (epic), with sub-issues justjs#101 (control
  element), justjs#102 (Socials migration)
