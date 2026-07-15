# ADR-0014: `@justjs/component-view` — reusable tile-grid view component

- **Status:** Accepted
- **Date:** 2026-07-14
- **Supersedes:** [ADR-0013](ADR-0013-connect-kit-no-grid-component.md)

## Summary

ADR-0013 concluded no grid component was needed by comparing
`.provider-grid` and `.widget-grid` as literal code — each currently
welded into a different host (`<control-provider-connector>` and
`WorkspaceElement` respectively), so neither looked duplicated *as code*.
That comparison missed the actual question: **what shape is this markup,
independent of which host currently owns it.** Once asked that way, both
are the same pattern — a grid of selectable tiles (icon/badge + label,
click → select) — just rendered by two different tightly-coupled owners.
Extract it as `<view-grid>`.

Originally scoped as `<control-grid>` (a `control-*`). Reclassified for
the same reason as `<view-toggle>` (ADR-0012): checked whether "which
tile is selected" is real state the grid itself needs to remember, or
just a reflection of data the host already computes. It's the latter —
`.provider-card`'s `selected` class is driven entirely by `connected`
(pre-computed, data-driven), not anything the grid tracks internally.

## Real evidence

`workspace.ts`'s `renderOverview()` (the SDLC hub — `WorkspaceElement`'s
own top-level view, not itself a `component-view` scope):

```typescript
<div class="widget-grid">
  ${SDLC_STAGES.map((s) => `
    <button class="widget widget-action" data-stage="${s.key}" type="button">
      <span class="widget-icon">${s.icon}</span>
      <span class="widget-label">${escapeHtml(s.label)}</span>
    </button>
  `).join("")}
</div>
```

`<control-provider-connector>`'s grid state (ADR-0007 — currently the same
markup independently duplicated 6x pre-migration, unified to one render
site once ADR-0007 ships):

```typescript
<div class="provider-grid">
  ${PROVIDER_CATALOG.map((p) => {
    const connected = this.isProviderConnected(p);
    return `
      <button type="button" class="provider-card${connected ? " selected" : ""}" data-provider-id="${p.id}">
        ${renderProviderBadge(p)}
        <span class="provider-name">${escapeHtml(p.name)}</span>
        <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
      </button>
    `;
  }).join("")}
</div>
```

Same skeleton in both: a grid container, a `<button>` tile per item, an
icon-ish element, a label, a click handler that reports which item was
picked. The real difference is the icon slot — `WorkspaceElement`'s tiles
use a plain emoji `<span>`, `<control-provider-connector>`'s use a colored
`<view-badge>` (ADR-0006) — and the provider grid additionally shows a
`selected` status, computed entirely from `connected` data the *host*
already has, not from anything the grid remembers itself. Both are real,
structural differences a single, stateless component can parameterize
around, not evidence of two different components — and not evidence that
it needs to own state either.

**Honest framing of the evidence, not overstated:** this is not "the same
code copied 6 times" the way the badge or connect-form were — it's two
real, distinct *consumers* (the SDLC hub, and the provider-connect flow)
independently arriving at the identical tile-grid shape. That is weaker
evidence than a byte-identical copy, but it is real: the shape is
identical, and unlike ADR-0013's comparison, this time the comparison is
made at the shape level, not the current-file level — which is exactly
the distinction ADR-0013 got wrong.

## Why this is a `view-*`, not a `control-*`

Same reasoning as `<view-toggle>` (ADR-0012): whether a tile is
`selected` is data the host already has and passes in per item — the
grid never needs to remember it across a re-render. It renders `items`
and relays a click as `item-select`; it doesn't own anything.

## Scope

### In scope

`<view-grid>` (`GridView`) — Shadow DOM, one property: `items` (array of
`{id, label, icon?, badgeColor?, badgeLogo?, status?, selected?}` —
`selected` supplied by the host, not computed internally; `badgeColor`
present renders a `<view-badge>` internally, absent renders a plain icon
`<span>`, covering both real cases above without forcing one caller into
the other's visual shape). Dispatches an `item-select` `CustomEvent`
(`detail: {id}`) when a tile is clicked.

### Out of scope, not guessed at

- Does not own what happens after selection (drilling into a stage,
  opening a provider's connect form) — that stays the host's job, exactly
  as `<view-toggle>` (ADR-0012) leaves content-swapping to its host.
- Does not compose `<control-provider-connector>` itself in this ADR — that
  composition (having `<control-provider-connector>` use `<view-grid>`
  internally for its own grid state) is real follow-up work for ADR-0007's
  implementing issue, not fixed here.
- Does not depend on, or require, decomposing `WorkspaceElement` into
  separate per-stage components. `WorkspaceElement`'s `renderOverview()`
  can adopt `<view-grid>` on its own, independent of whether that larger
  structural change ever happens.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006 through ADR-0012: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-grid", GridView)` as an import
side-effect, outside DDAS/boot-time validation. Composes `<view-badge>`
(ADR-0006) internally for the `badgeColor`-present case.

## Migration strategy

1. Ship `<view-grid>`, verified in isolation (renders plain-icon tiles,
   renders badge tiles, click dispatches `item-select`, `selected` prop
   reflected visually without the element mutating it itself).
2. Migrate `WorkspaceElement`'s `renderOverview()` (the SDLC hub) as the
   first real consumer — chosen over the provider-grid because it has no
   `selected`-styling complexity, the simpler of the two real shapes.
3. `<control-provider-connector>`'s own internal grid state migrates
   opportunistically, as part of its own implementing issue (ADR-0007),
   not bundled into this ADR's issues.

## Known limitations (disclosed, not papered over)

- Only `WorkspaceElement`'s hub migrates as part of this ADR's issues —
  `<control-provider-connector>` keeps rendering its own grid inline until
  that composition is done as separate follow-up work.
- The evidence for this component is structural-shape matching across two
  different real consumers, not byte-identical duplicated code — a
  softer bar than most other `component-view` elements were justified by.
  Disclosed explicitly, not glossed over.
- Shadow DOM styling cost, same as every sibling element: `.widget-grid`/
  `.widget-action`/`.provider-grid`/`.provider-card` rules in `app.css`
  need porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-grid>` ships in `component-view`'s `core`/`saf` with tests
      covering: plain-icon tile render, badge tile render (composes
      `<view-badge>`), `selected` prop reflected visually, `item-select`
      dispatched with the correct `id` on click, no internal mutation of
      `selected`
- [ ] `WorkspaceElement`'s `renderOverview()` migrated to `<view-grid>`,
      `verify_web.mjs` passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Implementation note (added post-merge, justjs#108)

Migrating `WorkspaceElement`'s `renderOverview()` surfaced one field
missing from this ADR's originally-listed `items` shape: `accentColor`
(a per-tile hex color). The SDLC hub's 9 tiles each carry their own hue
today via a light-DOM `[data-stage="..."]` CSS selector — Shadow DOM
rule matching can't reach inside `<view-grid>` from that selector, so
the color has to travel as real per-item data instead. Each stage's
existing hex value is unchanged, just supplied as `accentColor` rather
than resolved via CSS attribute selector.

## Relates to

- [ADR-0013](ADR-0013-connect-kit-no-grid-component.md) — the decision
  this supersedes
- [ADR-0006](ADR-0006-component-view-package.md) — `<view-badge>`, composed here
- [ADR-0007](ADR-0007-provider-connect-package.md) — `<control-provider-connector>`,
  whose own grid state is a real, deferred consumer of this element
- ADR-0001 (workspace layout, SAF structure invariants)
