# ADR-0013: `@justjs/connect-kit` — no standalone grid component

- **Status:** Superseded by [ADR-0014](ADR-0014-connect-kit-tile-grid.md)
- **Date:** 2026-07-14

## Why this was superseded

This ADR's "Decision" compared `.provider-grid` and `.widget-grid` as
they exist in the *current, tightly-coupled* code and found no separate
duplication — technically accurate, but that comparison only holds
because `.widget-grid` is welded into `WorkspaceElement` and
`.provider-grid` is welded into `<control-provider-connect>`. Once you
ask "what shape is this markup, independent of which host currently owns
it" instead of "is this exact code duplicated as-is," both are the same
tile-grid pattern (icon/badge + label + click-to-select, arranged in a
grid). Kept below, unedited, as the record of the reasoning that turned
out to be incomplete — see ADR-0014 for the corrected decision.

## Summary

`connect-kit` does not include, and will not include, a standalone
`<view-grid>`/`<control-grid>` component. Grid layout (`.provider-grid`,
`.widget-grid`) exists in `ai-code-editor` only as an internal
implementation detail of other things, never as independently duplicated
code — there is nothing a grid component would remove.

## Real evidence checked

**`.provider-grid`** — the provider-card grid inside every connect screen
(Cloud, SCM, Comms, Socials, PM, Cartoon). This is the exact same 6-file
duplication `<control-provider-connect>` (ADR-0007) already unifies — the
grid is one internal *state* of that one element (grid → detail →
connect-form → resource-list), not separable code duplicated on its own.
Splitting it into a second, separate `<view-grid>` component would divide
one cohesive unit into two pieces without eliminating any additional
duplication beyond what ADR-0007 already removes.

**`.widget-grid`** — the SDLC-stage overview grid inside `WorkspaceElement`
(`renderOverview()`). Checked directly: rendered from exactly **one**
place in the entire codebase, once. Not the same code copied across
files — a list render, not a duplication candidate.

**`agentic-memory-demo`'s `.widget`/`.widget-bar`** — checked and already
retracted earlier in this audit: all three variants (`widget-stat`,
`widget-bars`, `widget-action`) live in **one file** (`dashboard.ts`), a
different, unrelated example app in any case.

No other grid-shaped markup was found anywhere in `ai-code-editor`, the
other example apps, or the `@justjs/*` framework packages during the full
line-by-line component-file audit already performed for ADR-0006 through
ADR-0012.

## Decision

Do not build a grid component. The bar applied to every other
`connect-kit` element (real, counted code duplicated as *separate,
independent implementations* in 2+ files) is not met by any grid-shaped
markup in this codebase. `<control-provider-connect>` keeps its grid
rendering internal, as designed in ADR-0007.

## When to revisit

If a second, genuinely independent grid layout appears elsewhere in this
codebase (not nested inside an already-covered element like
`<control-provider-connect>`) and is duplicated in 2+ separate files, that
would be new evidence and this decision should be revisited then — not
before.

## Relates to

- [ADR-0007](ADR-0007-provider-connect-package.md) — where `.provider-grid`'s
  actual duplication is already addressed, as part of
  `<control-provider-connect>`
- ADR-0001 (workspace layout, SAF structure invariants)
