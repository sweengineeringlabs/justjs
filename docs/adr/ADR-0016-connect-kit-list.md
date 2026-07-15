# ADR-0016: `@justjs/component-view` — reusable list view component

- **Status:** Accepted
- **Date:** 2026-07-14

## Summary

The resource-list step at the end of every provider-connect screen is a
simple list of name+status rows. Extract the rendering of that step as
`<view-list>`, to be composed by `<control-provider-connector>` (ADR-0007).
This also closes the "is this a table?" question raised earlier — it's
this component, not a table (no headers, no columns, no sorting).

## Real, counted duplication (evidence, not estimate)

`socials.ts:240-251`, and the identical shape in `workspace.ts` (Cloud,
SCM, PM's own resource lists) and `communication.ts` (channels/messages,
via `resource-open-btn` making the whole row clickable):

```typescript
this.resources.length === 0
  ? `<p class="connect-hint">Connected - no results found.</p>`
  : `<ul class="resource-list">
      ${this.resources
        .map((r) => `
          <li class="resource-row">
            <span class="resource-name">${escapeHtml(r.name)}</span>
            <span class="resource-status">${escapeHtml(r.status)}</span>
          </li>
        `)
        .join("")}
    </ul>`;
```

`communication.ts`'s clickable variant (each row is itself a button,
dispatching drill-down into a channel/message thread):

```typescript
<li class="resource-row">
  <button type="button" class="resource-open-btn" data-resource-id="${r.id}">
    <span class="resource-name">${escapeHtml(r.name)}</span>
    <span class="resource-status">${escapeHtml(r.status)}</span>
  </button>
</li>
```

Same skeleton in both variants: an empty-state message, or a list of
name+status rows, optionally clickable. 6 real render sites collapse to
this one shape.

## Why this is a `view-*`, not a `control-*`

The list doesn't fetch anything or own loading/error state — that's
`<control-provider-connector>`'s job. It only renders whatever `items` it's
given (including the empty case) and relays a click as an event — the
same "props in, event out" shape as `<view-grid>`.

## Scope

### In scope

`<view-list>` (`ListView`) — Shadow DOM, properties: `items` (array of
`{id, name, status}`), `emptyMessage` (string, defaults to "Connected -
no results found."), `clickable` (boolean — when true, each row is a
`<button>` dispatching `item-select`; when false, a plain `<li>`, matching
the two real variants found above).

### Out of scope, not guessed at

- Pagination, sorting, filtering — none of the 6 existing lists have any
  of these; not invented speculatively.
- Column headers or a true tabular layout — checked directly, no
  `<table>` element exists anywhere in `ai-code-editor`; this stays a
  simple two-piece-per-row list, matching every real instance.

## Design: real Web Component, nested rather than routed

Same reasoning as every sibling ADR: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-list", ListView)` as an import
side-effect, outside DDAS/boot-time validation.

## Migration strategy

Not migrated standalone — ships as part of `<control-provider-connector>`'s
own migration (ADR-0007), since it has no real, independent consumer
outside that composition. Verified in isolation with its own test suite
before ADR-0007 composes it. `communication.ts`'s clickable channel/
message lists are real, additional consumers for a later, opportunistic
migration round — not bundled into ADR-0007's own scope, which only
migrates Socials.

## Known limitations (disclosed, not papered over)

- No standalone migration target in this ADR's own issues — this view
  only proves itself real once composed into `<control-provider-connector>`
  and that element migrates Socials.
- Shadow DOM styling cost: `.resource-list`/`.resource-row`/
  `.resource-name`/`.resource-status`/`.resource-open-btn` rules in
  `app.css` need porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-list>` ships in `component-view`'s `core`/`saf` with tests
      covering: empty state renders `emptyMessage`, non-empty renders
      name+status rows, `clickable=true` renders buttons and dispatches
      `item-select` with the correct `id`, `clickable=false` renders
      plain non-interactive rows
- [ ] Composed correctly by `<control-provider-connector>` (verified as part of
      ADR-0007's own acceptance criteria, not duplicated here)
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-provider-connect-package.md) — the primary real
  consumer, `<control-provider-connector>`
- ADR-0001 (workspace layout, SAF structure invariants)
