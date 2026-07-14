# ADR-0009: `@justjs/component-view` — reusable status-line view component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Five files hand-roll the identical "hidden `<p>` that a host shows/hides
with a message" pattern (`.editor-status` + `showStatus(text)`/
`hideStatus()`). Extract it as `<view-status-line>`.

## Real, counted duplication (evidence, not estimate)

`editor.ts:120` + `editor.ts:361-375`:

```typescript
<p id="editor-status" class="editor-status" hidden></p>
...
private showStatus(text: string): void {
  const status = this.querySelector<HTMLElement>("#editor-status");
  if (!status) return;
  status.hidden = false;
  status.textContent = text;
}
private hideStatus(): void {
  const status = this.querySelector<HTMLElement>("#editor-status");
  if (!status) return;
  status.hidden = true;
}
```

The identical shape (markup + show/hide pair, differing only by element
`id`) also appears in `scaffold.ts:89`, `workspace.ts:618` (Design) and
`workspace.ts:1553` (Slides — a second copy inside the same file, a
different sub-feature), and `review.ts:49`. 5 real instances total.

**Explicitly not this pattern:** `.connect-status`/`.connect-status-error`
(used inside `<control-provider-connector>`'s connect-form and Cartoon's
generate flow) is a **different, separate class** with its own error-vs-info
styling variant, already implicitly covered by ADR-0007's scope. This ADR
covers only `.editor-status`'s 5 copies.

## Why this is a `view-*`, not a `control-*`

Checked `showStatus`/`hideStatus` directly in all 5 files: no timers, no
async state, no debouncing — purely `text` in, visible/hidden markup out.
Redesigned as a component, a `text` property (empty string = hidden,
non-empty = visible with that text) fully replaces both methods. That's
the same "no internal state" bar `<view-badge>` and `<view-nav-header>`
were held to — this one was mis-classified as `control-*` earlier in this
audit before the actual handler code was checked; corrected here.

## Scope

### In scope

`<view-status-line>` (`StatusLineView`) — Shadow DOM, one property:
`text` (string; empty = hidden). No error/warning variant in v1 — none of
the 5 existing copies use one (that styling lives on the separate
`.connect-status-error` class, out of scope per above).

### Out of scope, not guessed at

- `.connect-status`/`.connect-status-error` (ADR-0007's territory, not
  this ADR's).
- Auto-dismiss timers, animation, or a message queue — none of the 5
  existing copies have this behavior; not invented speculatively.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006/ADR-0007/ADR-0008: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-status-line", StatusLineView)` as an
import side-effect, outside DDAS/boot-time validation.

## Migration strategy

1. Ship `<view-status-line>`, verified in isolation.
2. Migrate exactly **one** existing copy as the first real consumer —
   `editor.ts` (simplest, single copy, no surrounding OAuth/billing
   complexity).
3. Migrate the remaining 4 copies (`scaffold.ts`, `workspace.ts`×2,
   `review.ts`) opportunistically, not as a dedicated sweep.

## Known limitations (disclosed, not papered over)

- Only `editor.ts` migrates as part of this ADR's issues — the other 4
  copies keep their hand-written `showStatus`/`hideStatus` pair until
  migrated individually.
- Shadow DOM styling cost: the `.editor-status` rule in `app.css` needs
  porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-status-line>` ships in `component-view`'s `core`/`saf` with
      tests covering: empty text (hidden), non-empty text (visible,
      matches textContent), text cleared after being set (hides again)
- [ ] `editor.ts` migrated to `<view-status-line>`, `verify_web.mjs`
      passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-provider-connect-package.md) — the separate
  `.connect-status` pattern this ADR explicitly excludes
- ADR-0001 (workspace layout, SAF structure invariants)
