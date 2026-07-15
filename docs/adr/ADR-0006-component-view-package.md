# ADR-0006: `@justjs/component-view` — package scaffold + reusable badge view

- **Status:** Accepted
- **Date:** 2026-07-14

## Summary

`ai-code-editor` now has six independent, hand-written implementations of
the same provider-connect screen (grid of providers -> detail view ->
credential form -> resource list), plus a byte-for-byte duplicated badge
renderer. This ADR scopes a new package, `@justjs/component-view`, and
its first, lowest-risk piece: a real, stateless view component,
`<view-badge>`.

## Package split: `component-view` vs. `provider-connect`

Originally scoped as one package, `@justjs/connect-kit`, holding
everything — 10 views plus the one stateful control plus the
credential-store helper. Split in two once real cross-app evidence
showed the audiences differ:

- **The 10 view components are genuinely generic UI shapes**, not tied to
  `ai-code-editor`'s provider concept at all — checked `cross-target-demo`
  (`login.ts`'s 2-field form matches `<view-form>`'s shape) and
  `agentic-memory-demo` (`dashboard.ts`'s search/add-memory forms match
  `<view-form>`; its `widget-action` tiles match `<view-grid>`). Neither
  app has any notion of "a provider" — bundling them with
  provider-specific code would force any future consumer of just the
  views to pull in code they'll never use.
- **`<control-provider-connector>` and `createCredentialStore()` are not
  generic** — their entire API is built around `ai-code-editor`'s own
  provider concept (`CloudProvider`/`ScmProvider`/etc.). They stay
  together in a second package, `@justjs/provider-connect` (ADR-0007),
  which depends on `component-view` for the pieces it composes.

Package-naming note: `component-view` doesn't follow the bare-verb
tag-naming rule (that rule is specifically about Custom Element tags
reading like labeled things on a page) — it's a plain, accurate package
name for "the package that ships view components."

This ADR does **not** propose retrofitting the six existing screens in one
pass — see [Migration strategy](#migration-strategy).

## Why this wasn't designed in ADR-0001

ADR-0001 defines four OSI-style layers (network/transport/application/data)
plus AOP concerns woven at boot. Neither category fits: `component-view`
is not a layer (it has no independent runtime responsibility — it renders
UI using the `application` layer's `Component`/`Lifecycle` contracts) and
it is not an AOP concern (nothing needs to weave it in by strategy name at
boot time; a screen either imports it or it doesn't). It also isn't a
`*-connect` package itself — it has no external API, no provider concept,
no `spi/` self-registration, and (unlike `provider-connect`, ADR-0007) no
dependency on any `*-connect` package either. It's a plain UI library,
consumable by any app, which didn't exist as a pattern when ADR-0001 was
written.

## Design: real Web Components, nested rather than routed

The visual pieces ship as real Custom Elements with their own Shadow
DOM-encapsulated HTML and CSS — not plain string-returning render
functions. That is a deliberate change from the current 6 screens, which
all render via `innerHTML` template strings against **global, leaky** CSS
classes in `app.css` (`.provider-grid`/`.provider-card`/...). A real Web
Component encapsulates its own markup and styles — a host screen places
the tag, sets its properties, and nothing it does can accidentally clash
with the host's own CSS, which is a real bug class the current
shared-global-class approach already has latent (nothing stops one
screen's future CSS edit from silently breaking another screen's
`.provider-card`).

This does **not** mean going through JustJS's `*_component.yaml` /
`justw generate app` pipeline. That pipeline exists for **routed,
top-level, boot-validated** components — one YAML maps to one mount point,
checked against `routes.gen.json`/`registry.gen.ts`/`dom-address-map.json`
at boot (ADR-0001's DDAS section). `component-view`'s elements are not
routed or independently mounted; they are nested inside an existing
routed component's own template, the same way a third-party Web Component
library would be consumed. Concretely:

- `view-badge` (and every sibling view — ADR-0008 through ADR-0016) is a
  hand-authored `HTMLElement` subclass using
  `attachShadow({ mode: "open" })`, with its own `<style>` in the shadow
  root. No `x-*`/`js-*` vendor prefix — checked via grep, that split
  exists in this app specifically to distinguish hand-authored vs.
  justw-generated **routed** top-level components (`x-cartoon` vs.
  `js-cartoon`), which `component-view`'s nested elements were never part
  of to begin with.
- It self-registers via `customElements.define(...)` as an import
  side-effect in `component-view`'s own `saf/index.ts` — the same
  self-registering spirit as `spi/` providers, but simpler (no strategy
  string, no registry lookup; importing the package is enough).
- A host component (e.g. `SocialsElement.render()`) places `<view-badge>`
  in its template and sets its properties imperatively after the element
  is in the DOM.
- Because these tags are never referenced in any `AspectConfig`'s
  `.on([])`/`.except([])`, they are outside DDAS/boot-time validation
  entirely (ADR-0001: only tags targeted by aspect weaving need a
  `registry.gen.ts`/`dom-address-map.json` entry) — no `component.yaml`,
  no route, no generated files.

## Real, counted duplication (evidence, not estimate)

Grepped directly from the current `ai-code-editor` tree before writing
this ADR:

`renderProviderBadge()` — identical in 4 files, `workspace.ts:250`,
`communication.ts:94`, `socials.ts:68`, `cartoon.ts:90` — same 3-line body
in every copy:

```typescript
function renderProviderBadge(p: { readonly icon?: string; readonly color: string; readonly logo?: string }): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon ?? "");
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
}
```

## Scope

### In scope (this ADR)

1. Package scaffold: `component-view/scm/main` (`@justjs/component-view`),
   registered in root `package.json`.
2. `<view-badge>` (`BadgeView`) — a real Custom Element (Shadow DOM,
   `icon`/`color`/`logo` properties), replacing the 4x duplicated
   render-to-string function with the same visual output. Pure
   presentation: no internal state, no dispatched events.

### Out of scope (this ADR)

- `createCredentialStore()` and `<control-provider-connector>` — moved to
  `@justjs/provider-connect` (ADR-0007); not visual concepts, and not
  generic across apps the way this package's views are.
- The other 9 views (`<view-nav-header>`, `<view-status-line>`,
  `<view-prompt-field>`, `<view-grid>`, `<view-toggle>`, `<view-form>`,
  `<view-list>`, `<view-image-attach>`, `<view-image-picker>`) — each its
  own ADR (0008–0016), all living in this same package once scaffolded.
- **OAuth-redirect providers (Jira)** and **billed-generate providers
  (Cartoon)** — out of scope for `provider-connect` (ADR-0007), not
  applicable to this purely-visual package at all.
- **The settings-sheet pattern** (global Anthropic key modal — the only
  real instance; `communication.ts`'s own "Settings" turned out to be a
  full-page view, not a second modal instance) — not enough duplication
  to justify extraction. Revisit if a 2nd real modal instance appears.
- Retrofitting the 6 existing screens onto the new views in this same
  effort — see Migration strategy.

## Package location

`component-view/scm/main` (`@justjs/component-view`) — a new top-level
workspace, placed alongside `cloud-connect/scm/main`, `pm-connect/scm/main`,
etc. (existing precedent: every package already lives at repo root, not
nested under `aop/`). It is registered in root `package.json`'s
`workspaces` array and build/typecheck filter chains the same way
`image-connect` was added earlier this session.

It follows the same SAF shape as every other workspace (ADR-0001's hard
invariant), with one deliberate simplification: no `spi/` is required.
`spi/` exists for **extension points resolved by strategy name at
runtime** (`justjs.providers.register()`); `component-view` has no such
concept — a screen imports the custom elements directly, there is nothing
to swap by string key. `src/spi/` may still exist empty (S8 in
ADR-0001's invariant table is a warning, not an error, if absent).

`component-view` has **zero dependency** on `@justjs/provider-connect` or
any `*-connect` package — dependency flows the other direction
(`provider-connect` depends on `component-view`, ADR-0007).

```
component-view/scm/main/src/
  api/
    provider_catalog.ts   # ProviderCatalogEntry and other shared prop types
  core/
    badge_view.ts          # BadgeView (HTMLElement, Shadow DOM) - this ADR
    nav_header_view.ts      # ADR-0008
    status_line_view.ts     # ADR-0009
    prompt_field_view.ts    # ADR-0011
    grid_view.ts             # ADR-0014
    toggle_view.ts           # ADR-0012
    form_view.ts              # ADR-0015
    list_view.ts               # ADR-0016
    image_attach_view.ts       # ADR-0010
    image_picker_view.ts       # ADR-0010
  saf/
    index.ts               # registers all 10 tags via
                            # customElements.define() as import side-effects
```

## Migration strategy

Build `component-view` fresh; do not touch the 6 existing screens in the
same change. Retrofitting all 6 at once risks regressing ~300
already-passing `verify_web.mjs` assertions for a purely
cosmetic/structural win. For this ADR's scope specifically:

1. Ship the package scaffold and `<view-badge>`, verified in isolation
   with their own test suite.
2. Replace all 4 local `renderProviderBadge()` copies with `<view-badge>`.

## Known limitations (disclosed, not papered over)

- This ADR alone does not reduce the 6x connect-form duplication — that's
  `provider-connect`'s scope (ADR-0007). Shipping only this ADR still
  leaves every screen's grid/detail/form/list logic hand-written.
- Moving to Shadow DOM is a real, non-free styling cost, not a drop-in
  swap: the existing `.provider-icon` rule in `app.css` is global and
  won't reach inside a shadow root. It needs to be ported into
  `<view-badge>`'s own `<style>` block (and can drift from the
  global copy until every screen migrates) — the exact CSS a screen
  visually needs stays the same, only where it's declared changes.

## Acceptance criteria

- [ ] `component-view/scm/main` exists, passes ADR-0001's SAF structure
      invariants (S1-S17, `spi/` may be empty)
- [ ] `<view-badge>` ships with tests, matching existing visual
      output (icon/logo/color rendering) of the current 4 duplicated copies
- [ ] All 4 local `renderProviderBadge()` copies removed from
      `ai-code-editor`, replaced with `<view-badge>`
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- ADR-0001 (workspace layout, SAF structure invariants)
- [ADR-0007](ADR-0007-provider-connect-package.md) — `@justjs/provider-connect`,
  the sibling package holding `<control-provider-connector>` and
  `createCredentialStore()`, which depends on this package
- Real duplication introduced across this session's `cloud-connect`,
  `scm-connect`, `comms-connect`, `social-connect`, `pm-connect`,
  `image-connect` rounds (all six `ai-code-editor` provider-connect
  screens)
- Tracked by justjs#97 (epic), with sub-issues justjs#98 (scaffold),
  justjs#100 (view element)
