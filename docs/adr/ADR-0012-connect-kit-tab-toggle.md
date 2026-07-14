# ADR-0012: `@justjs/connect-kit` — reusable tab-toggle control component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Three instances of the same 2-way segmented toggle exist in `workspace.ts`
and `scaffold.ts`: two buttons, one marked `.active`, clicking either
swaps which content is visible. Extract it as `<control-tab-toggle>`.

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

3 real instances total across 2 files.

## Why this is a `control-*`, not a `view-*`

It owns real state (which option is currently active) and reacts to
interaction — the same bar `<control-provider-connect>` and
`<control-image-attach>` were held to. Unlike `<view-nav-header>` (which
only relays a click without tracking anything), this element must
remember which option is selected to render the correct `.active` class
on re-render.

## Scope

### In scope

`<control-tab-toggle>` (`TabToggleControl`) — Shadow DOM, one property:
`options` (an array of `{value, label}`, 2 entries in every existing
instance — not artificially restricted to exactly 2, since nothing about
the shape requires it, but not designed for many either). Dispatches a
`tab-change` `CustomEvent` (`detail: {value}`) when a different option is
clicked. The host owns what the two states actually show/hide — this
element only owns which one is marked active and firing the event.

### Out of scope, not guessed at

- Content swapping (showing/hiding the panes underneath) stays the host's
  job in v1 — none of the 3 existing instances have identical panes, so
  there's nothing common to extract there beyond the toggle itself.
- No animation/transition between states — none of the 3 existing
  instances have one.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006 through ADR-0011: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("control-tab-toggle", TabToggleControl)` as an
import side-effect, outside DDAS/boot-time validation.

## Migration strategy

1. Ship `<control-tab-toggle>`, verified in isolation with its own test
   suite (render, click switches active state, `tab-change` dispatched
   with correct `value`).
2. Migrate exactly **one** existing screen as the first real consumer —
   Scaffold's New File/New Project toggle (simpler than Design/Slides:
   no Mermaid-render token-guard complexity sitting behind it).
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

## Acceptance criteria

- [ ] `<control-tab-toggle>` ships in `connect-kit`'s `api`/`core`/`saf`
      with tests covering: initial active state (first option by default,
      matching all 3 existing instances), click switches active state,
      `tab-change` dispatched with the correct `value`
- [ ] Scaffold's New File/New Project toggle migrated to
      `<control-tab-toggle>`, `verify_web.mjs` passes with no assertion
      count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-connect-kit-view.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-connect-kit-control.md) through
  [ADR-0011](ADR-0011-connect-kit-prompt-field.md) — the other elements in
  this package
- ADR-0001 (workspace layout, SAF structure invariants)
