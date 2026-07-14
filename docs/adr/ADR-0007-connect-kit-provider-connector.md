# ADR-0007: `@justjs/connect-kit` — reusable provider-connector control component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Split out from [ADR-0006](ADR-0006-connect-kit-view.md) to review the
stateful, higher-risk piece of `@justjs/connect-kit` independently:
`<control-provider-connector>`, a real Custom Element covering provider grid
-> tap -> credential form -> Connect -> resource list, replacing 6
independent hand-written implementations
(`workspace.ts`'s Cloud/SCM/PM, `communication.ts`, `socials.ts`,
`cartoon.ts`).

Package scaffold, SAF location, the general "why real Web Components,
nested not routed" design, and the low-risk `<view-badge>`
element are decided in ADR-0006 — not repeated here.

This ADR does **not** propose retrofitting all 6 existing screens — see
[Migration strategy](#migration-strategy).

## Naming: `provider-connector`, not `provider-connect`

Originally named `<control-provider-connect>`, briefly renamed
`<control-provider-flow>`. Settled on `provider-connector`: "connect" is
a bare verb with no object ("connect" what, to what?) — every sibling
`control-*`/`view-*` name ends in a noun describing what the thing *is*
(`grid`, `toggle`, `badge`), not what it does. "Flow" fixed that but
implied more generality than this element actually has — it's not a
general multi-step-wizard component (it explicitly excludes Jira's OAuth
flow and Cartoon's billed-generate flow, both real multi-step processes
this element deliberately does *not* handle). "Connector" is narrower and
more accurate, and matches vocabulary already real in this codebase —
`BEARER_CONNECTORS`, `SCM_CONNECTORS`, `PM_CONNECTORS`,
`COMMS_CONNECTORS`, `CARTOON_CONNECTORS` are all existing variable names
for "the function that does the connecting," in every one of the 6
screens this element replaces. "Provider" stays, unlike the badge's
naming — this element's entire API is built around the concept of a
provider (the `.providers` catalog, `kind`-based form branching), not
incidentally borrowing the word from its current use site.

## Why this is a real control, not decomposed further

Unlike `<view-grid>` (ADR-0014), `<view-toggle>` (ADR-0012), and the
image-attach views (ADR-0010) — all reclassified from control to view
once checked, because their "state" turned out to be data the host
already owned — this element is different: the sequencing itself (which
step you're on, whether a connect call is in flight, whether it
succeeded) is not data any external host currently owns; it's exactly
what's independently reimplemented 6 times today. Composing pure views
for the *rendering* of each step doesn't remove the need for something
to own *which step you're on and drive the actual async calls* — that
orchestration is real, owned state, the same bar `<control-image-attach>`
(now decomposed away, ADR-0010) was originally justified by before its
own reconsideration showed the async work was already shared elsewhere.
Here, it isn't shared elsewhere — the state machine is the duplication.

## Real, counted duplication (evidence — full detail in ADR-0006)

Six independent implementations of the same grid -> detail -> connect-form
-> resource-list sequence, sharing CSS classes
(`.provider-grid`/`.provider-card`/`.connect-form`/`.connect-actions`/
`.connect-status`/`.resource-list`/`.resource-row`) but with zero shared
render/state logic: `workspace.ts` (Cloud, SCM, PM — 3 separate render
paths in one file), `communication.ts`, `socials.ts`, `cartoon.ts`.

## Scope

### In scope

`<control-provider-connector>` (`ProviderConnectorControl`) — a real Custom Element
(`HTMLElement` subclass, `attachShadow({mode: "open"})`) covering the
**common case**: single- or two-field bearer-style credential form.
Configured via a `.providers` catalog property (id/name/icon/color/logo)
plus caller-supplied `.connect(config)` / `.list(session)` function
properties — the caller supplies the actual network calls (already
implemented per-package in each `*-connect` SAF), the element owns which
step it's on (grid/form/connecting/error/list) and dispatches
`CustomEvent`s (`connected`, `resource-select`, `error`) for the host to
react to.

**Composes, rather than hand-renders, its own steps:**
- `<view-grid>` (ADR-0014) for the provider-selection step — passing
  `selected` per item computed from its own `isProviderConnected()` check
  (data it already owns), listening for `item-select`.
- `<view-form>` (ADR-0015) for the credential-entry step — passing the
  field config (1 or 2 inputs, matching each provider's `kind`), listening
  for `submit`.
- `<view-status-line>` (ADR-0009) for the connecting/error status line.
- `<view-list>` (ADR-0016) for the resource-list step, once connected.
- `<view-badge>` (ADR-0006), composed inside `<view-grid>`, for each
  provider-card icon (unchanged from the original scoping).

This element's own remaining responsibility, after composing those four
views, is genuinely thin: track which step is current, call
`.connect()`/`.list()` at the right time, and translate their results
into props on the next view down. That's the real, non-decomposable
"control" left once the rendering is factored out.

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
`customElements.define("control-provider-connector", ProviderConnectorControl)`
as an import side-effect, no `x-*`/`js-*` vendor prefix, nested inside an
existing routed component's template rather than independently routed —
outside DDAS/boot-time validation entirely since it's never targeted by an
`AspectConfig`'s `.on([])`/`.except([])`. Full reasoning in ADR-0006.

## Migration strategy

1. Ship `<control-provider-connector>`, verified in isolation with its own
   test suite (jsdom/happy-dom-based Shadow DOM assertions, matching the
   harness `comms-connect` already proved out this session) — including
   tests that it correctly composes and reacts to events from
   `<view-grid>`/`<view-form>`/`<view-list>`/`<view-status-line>`, not
   just its own markup.
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
- This ADR depends on ADR-0009 (`<view-status-line>`), ADR-0014
  (`<view-grid>`), ADR-0015 (`<view-form>`), and ADR-0016 (`<view-list>`)
  all being available — its own implementing issue is sequenced after
  theirs, not parallel to them.
- Moving to Shadow DOM means the existing `.provider-grid`/`.connect-*`/
  `.resource-*` rules in `app.css` need to be ported into the composed
  views' own `<style>` blocks — real work, and they can drift from the
  global copies until every screen migrates.
- `ProviderConnectorControl`'s exact property/event surface is a design
  decision for the implementing issue, not fully fixed by this ADR — the
  grid/form/list states and which views they compose are fixed, the
  precise config and event names are not.

## Acceptance criteria

- [ ] `<control-provider-connector>` ships with tests covering grid/form/
      connecting/error/list states, composing
      `<view-grid>`/`<view-form>`/`<view-list>`/`<view-status-line>`
      correctly, explicitly excluding OAuth and generate/billing variants
- [ ] Socials tab (`socials.ts`) migrated to consume
      `<control-provider-connector>`, `verify_web.mjs` passes with no
      assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-connect-kit-view.md) — package scaffold, shared
  Web Component design rationale, `<view-badge>`
- [ADR-0009](ADR-0009-connect-kit-status-line.md) — `<view-status-line>`,
  composed here
- [ADR-0014](ADR-0014-connect-kit-tile-grid.md) — `<view-grid>`, composed
  here
- [ADR-0015](ADR-0015-connect-kit-form.md) — `<view-form>`, composed here
- [ADR-0016](ADR-0016-connect-kit-list.md) — `<view-list>`, composed here
- ADR-0001 (workspace layout, SAF structure invariants)
- Tracked by justjs#97 (epic), with sub-issues justjs#101 (provider-connector
  element), justjs#102 (Socials migration)
