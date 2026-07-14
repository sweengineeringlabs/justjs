# ADR-0008: `@justjs/connect-kit` — reusable nav-header view component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

`ai-code-editor` has a "back button + title" header
(`.dash-subnav`/`.dash-back-btn`/`.workspace-stage-title`) hand-coded at
every sub-screen boundary in the app — not just the 6 provider-connect
screens ADR-0006/ADR-0007 cover, but Design, Slides, Cloud, Repository,
Project Management, and CLI too. It is the single most duplicated pattern
found across this whole audit — more copies than the badge or the
connect-form. Extract it as `<view-nav-header>`.

## Real, counted duplication (evidence, not estimate)

`workspace.ts` alone has 10 separate copies (grepped directly, not
estimated):

```typescript
// workspace.ts:520
<div class="dash-subnav">
  <button id="workspace-back-btn" class="dash-back-btn" type="button">← Workspace</button>
  <h2 class="workspace-stage-title">${stage.icon} ${escapeHtml(stage.label)}</h2>
</div>

// workspace.ts:607 (Design)
<div class="dash-subnav">
  <button id="workspace-back-btn" class="dash-back-btn" type="button">← Design</button>
  <h2 class="workspace-stage-title">🎨 Generate</h2>
</div>

// workspace.ts:806 (Cloud), :855 (Cloud provider detail), :1126 (Repository),
// :1284 (Project Management), :1780 (CLI) — same shape, different label/icon.
```

Plus `socials.ts` (2 copies — one **without** a back button, the top-level
grid header):

```typescript
// socials.ts:115 — top-level, no back button
<div class="dash-subnav">
  <h2 class="workspace-stage-title">🌐 Socials</h2>
</div>

// socials.ts:150 — detail view, with back button
<div class="dash-subnav">
  <button id="socials-back-btn" class="dash-back-btn" type="button">← Socials</button>
  <h2 class="workspace-stage-title">${renderProviderBadge(provider)} ${escapeHtml(provider.name)}</h2>
</div>
```

Plus one copy each in `cartoon.ts` and `communication.ts`. In every case
the back button's click handler is trivial and entirely local to the host
— e.g. `socials.ts`: `this.selectedProviderId = null; this.renderView();`
— the header itself has no opinion about what "back" means.

## Why this is a `view-*`, not a `control-*`

Checked the actual handlers, not assumed: none of these headers own any
internal state (no selection, no loading, no error) — they take an
icon/title and, optionally, a back-target label, and relay a single click
as an event. That's the same "no state owned" bar `<view-badge>` (ADR-0006)
was held to. A component that dispatches an event without tracking
anything itself is still a view under this repo's own distinction — a
`<button>` element dispatches `click` and nobody calls that "stateful."

## Scope

### In scope

`<view-nav-header>` (`NavHeaderView`) — Shadow DOM, properties: `icon`
(optional string/emoji), `title` (string), `backLabel` (optional string —
omitted means no back button, matching Socials' top-level grid header).
Dispatches a `nav-back` `CustomEvent` when the back button is clicked; the
host decides what "back" means (clear selection, pop a stage, navigate to
a parent route) exactly as it does today.

### Out of scope, not guessed at

- No breadcrumb / multi-level history stack — this replaces a
  single-target "back to X" header, not a navigation manager. If a screen
  ever needs multi-level breadcrumbs, that's a different, bigger component.
- No composition with `<view-badge>` in v1 (unlike
  `<control-provider-flow>`) — some headers show a provider badge next
  to the title (`socials.ts:150`), most don't. The `title` slot accepts
  arbitrary content so a caller can still place a badge inside it; the
  element itself doesn't special-case that.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006/ADR-0007: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix (that split
distinguishes hand-authored vs. generated **routed** components, which
this nested element is not), self-registers via
`customElements.define("view-nav-header", NavHeaderView)` as an import
side-effect in `connect-kit`'s `saf/index.ts`, outside DDAS/boot-time
validation since it's never an `AspectConfig` target.

## Migration strategy

Unlike `<control-provider-flow>` (tied 1:1 to a screen), this header
appears many times **within** a single file (`workspace.ts` has 10 copies
across unrelated sub-features). Migrating "one screen" doesn't map
cleanly, so instead:

1. Ship `<view-nav-header>`, verified in isolation.
2. Migrate all copies in exactly **one file** first — `socials.ts` (2
   copies, including the no-back-button case), proving both configurations
   end-to-end.
3. Migrate `workspace.ts`'s 10 copies, `cartoon.ts`, and `communication.ts`
   opportunistically (next time each sub-feature is touched for an
   unrelated reason), not as a dedicated sweep — same reasoning as
   ADR-0006/ADR-0007's migration strategy.

## Known limitations (disclosed, not papered over)

- Only `socials.ts` will be migrated as part of this ADR's issues — every
  other copy (10 in `workspace.ts`, 1 each in `cartoon.ts`/
  `communication.ts`) keeps its hand-written header until migrated
  individually.
- Shadow DOM styling cost, same as every other `connect-kit` element:
  `.dash-subnav`/`.dash-back-btn`/`.workspace-stage-title` rules in
  `app.css` need porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-nav-header>` ships in `connect-kit`'s `core`/`saf` with tests
      covering: title-only render (no back button), title+backLabel render
      (back button present), `nav-back` event dispatch on click
- [ ] `socials.ts`'s 2 copies migrated to `<view-nav-header>`,
      `verify_web.mjs` passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-connect-kit-view.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-connect-kit-provider-flow.md)
- ADR-0001 (workspace layout, SAF structure invariants)
