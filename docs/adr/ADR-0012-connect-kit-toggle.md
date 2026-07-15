# ADR-0012: `@justjs/component-view` — reusable toggle view component

- **Status:** Accepted
- **Date:** 2026-07-14

## Summary

Three instances of the same 2-way segmented toggle exist in `workspace.ts`
and `scaffold.ts`: two buttons, one marked `.active`, clicking either
swaps which content is visible. Extract it as `<view-toggle>`.

Originally scoped as `<control-tab-toggle>` (a `control-*`). Reclassified:
checked which value is "active" in all 3 existing instances, and in every
case it's data the **host** already tracks (`designViewMode`,
`slidesViewMode`, Scaffold's mode) — the toggle itself never needs to
remember anything across a re-render if the host just passes the current
value back in as a property. That's the same shape as `<view-nav-header>`
(relays a click, owns nothing) — so this is a view, not a control.

## Real, counted duplication (evidence, not estimate)

`workspace.ts:620-623` (Design's Edit/Preview) and `workspace.ts:1555-1558`
(Slides' Edit/Preview — a **second, separate instance reusing the exact
same CSS classes**, `.design-mode-toggle`/`.design-mode-btn`):

```typescript
<div class="design-mode-toggle">
  <button id="design-mode-edit-btn" type="button" class="design-mode-btn active">Edit</button>
  <button id="design-mode-preview-btn" type="button" class="design-mode-btn">Preview</button>
</div>
```

Each wired identically:

```typescript
this.querySelector("#design-mode-edit-btn")?.addEventListener("click", () => void this.setDesignViewMode("edit"));
this.querySelector("#design-mode-preview-btn")?.addEventListener("click", () => void this.setDesignViewMode("preview"));
```

`scaffold.ts:48-51` (New File/New Project — its own, differently-named
classes, `.scaffold-mode-toggle`/`.scaffold-mode-btn`, but the identical
interaction shape):

```typescript
<div class="scaffold-mode-toggle">
  <button id="scaffold-mode-file-btn" type="button" class="scaffold-mode-btn active">New File</button>
  <button id="scaffold-mode-project-btn" type="button" class="scaffold-mode-btn">New Project</button>
</div>
```

```typescript
this.querySelector("#scaffold-mode-file-btn")?.addEventListener("click", () => this.setMode("file"));
this.querySelector("#scaffold-mode-project-btn")?.addEventListener("click", () => this.setMode("project"));
// setMode() toggles .active on both buttons and hidden on both content panes
```

3 real instances total across 2 files. In every one, `designViewMode`/
`slidesViewMode`/Scaffold's mode is a field the *host* owns and re-renders
from — the `.active` class is a pure reflection of that host state, never
computed or remembered by the toggle markup itself.

## Why this is a `view-*`, not a `control-*`

A "controlled component" in the classic UI sense: the host passes in
which value is currently active (`activeValue`), the toggle renders that
value as `.active` and relays clicks as an event — it never stores
"which one is active" as its own internal field. That's props in, markup
+ events out, the same bar `<view-badge>`/`<view-nav-header>` were held
to, not the "owns real state across renders" bar that keeps
`<control-provider-connector>` (ADR-0007) a control.

## Scope

### In scope

`<view-toggle>` (`ToggleView`) — Shadow DOM, properties: `options` (an
array of `{value, label}`, 2 entries in every existing instance — not
artificially restricted to exactly 2, since nothing about the shape
requires it, but not designed for many either) and `activeValue` (which
one is currently active, supplied by the host). Dispatches a `change`
`CustomEvent` (`detail: {value}`) when a different option is clicked. The
host owns both which value is active and what the two states actually
show/hide — this element only renders the current value and fires the
event.

### Out of scope, not guessed at

- Content swapping (showing/hiding the panes underneath) stays the host's
  job — none of the 3 existing instances have identical panes, so there's
  nothing common to extract there beyond the toggle itself.
- No animation/transition between states — none of the 3 existing
  instances have one.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006 through ADR-0011: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-toggle", ToggleView)` as an import
side-effect, outside DDAS/boot-time validation.

## Migration strategy

1. Ship `<view-toggle>`, verified in isolation with its own test suite
   (render reflects `activeValue`, click dispatches `change` with correct
   `value`, does not mutate its own `activeValue` property — the host
   must set it again for the visual state to update, proving it's truly
   controlled).
2. Migrate exactly **one** existing screen as the first real consumer —
   Scaffold's New File/New Project toggle (simpler than Design/Slides: no
   Mermaid-render token-guard complexity sitting behind it).
3. Migrate Design's and Slides' copies opportunistically, not as a
   dedicated sweep.

## Known limitations (disclosed, not papered over)

- Only Scaffold migrates as part of this ADR's issues — Design's and
  Slides' copies (which share literal CSS classes with each other, not
  with Scaffold) keep their hand-written toggles until migrated
  individually.
- Shadow DOM styling cost: `.design-mode-toggle`/`.design-mode-btn` and
  `.scaffold-mode-toggle`/`.scaffold-mode-btn` rules in `app.css` need
  porting into this element's own `<style>` block — two different visual
  treatments for the same underlying component, ported once and
  parameterized (or left as a CSS custom-property hook), a decision for
  the implementing issue.
- Being a controlled view means every host must re-set `activeValue`
  after handling `change` for the visual state to update — a small extra
  step compared to the toggle managing its own state, traded deliberately
  for a simpler, stateless component.

## Acceptance criteria

- [ ] `<view-toggle>` ships in `component-view`'s `core`/`saf` with tests
      covering: renders `activeValue` as active, click dispatches
      `change` with the correct `value`, does not self-mutate
      `activeValue`
- [ ] Scaffold's New File/New Project toggle migrated to `<view-toggle>`,
      `verify_web.mjs` passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-provider-connect-package.md) through
  [ADR-0011](ADR-0011-connect-kit-prompt-field.md) — the other elements in
  this package
- ADR-0001 (workspace layout, SAF structure invariants)
