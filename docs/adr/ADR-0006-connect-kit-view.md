# ADR-0006: `@justjs/connect-kit` — package scaffold + reusable view component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

`ai-code-editor` now has six independent, hand-written implementations of
the same provider-connect screen (grid of providers -> detail view ->
credential form -> resource list), plus a byte-for-byte duplicated badge
renderer and a byte-for-byte duplicated credential-storage helper. This
ADR scopes the new package itself, `@justjs/connect-kit`, and its first,
lowest-risk piece: a real, stateless view component,
`<view-badge>`, plus the non-visual credential-store helper.

The stateful piece — `<control-provider-connector>`, which owns real
selection/loading/error state and dispatches events — is deliberately
**not** decided here. See [ADR-0007](ADR-0007-connect-kit-provider-connector.md).
Splitting the two lets the low-risk, easy-to-review view piece ship
independently of the higher-risk stateful one — see
[Why split view from control](#why-split-view-from-control-adr-0007).

This ADR does **not** propose retrofitting the six existing screens in one
pass — see [Migration strategy](#migration-strategy).

## Why this wasn't designed in ADR-0001

ADR-0001 defines four OSI-style layers (network/transport/application/data)
plus AOP concerns woven at boot. Neither category fits: `connect-kit` is
not a layer (it has no independent runtime responsibility — it renders UI
using the `application` layer's `Component`/`Lifecycle` contracts) and it
is not an AOP concern (nothing needs to weave it in by strategy name at
boot time; a screen either imports it or it doesn't). It also isn't a
`*-connect` package itself — it has no external API, no provider concept,
no `spi/` self-registration. It's a UI library consumed BY `*-connect`
integrations, which didn't exist as a pattern when ADR-0001 was written.

## Why split view from control (ADR-0007)

A view component is pure presentation — properties in, markup out, no
internal state, nothing to get wrong except visual output. A control
component owns real state (which provider is selected, loading, error)
and dispatches events other code reacts to — a fundamentally different,
higher-risk kind of decision: its property/event contract is an API other
code depends on, and migrating a real screen onto it carries real
regression risk. Deciding and shipping the view piece doesn't need to wait
on settling that harder design, so they're two separate ADRs, reviewable
and shippable independently.

## Design: real Web Components, nested rather than routed

The visual pieces (badge, provider-connect flow) ship as real
Custom Elements with their own Shadow DOM-encapsulated HTML and CSS — not
plain string-returning render functions. That is a deliberate change from
the current 6 screens, which all render via `innerHTML` template strings
against **global, leaky** CSS classes in `app.css`
(`.provider-grid`/`.provider-card`/...). A real Web Component encapsulates
its own markup and styles — a host screen places the tag, sets its
properties, and nothing it does can accidentally clash with the host's own
CSS, which is a real bug class the current shared-global-class approach
already has latent (nothing stops one screen's future CSS edit from
silently breaking another screen's `.provider-card`).

This does **not** mean going through JustJS's `*_component.yaml` /
`justw generate app` pipeline. That pipeline exists for **routed,
top-level, boot-validated** components — one YAML maps to one mount point,
checked against `routes.gen.json`/`registry.gen.ts`/`dom-address-map.json`
at boot (ADR-0001's DDAS section). `connect-kit`'s elements are not routed
or independently mounted; they are nested inside an existing routed
component's own template, the same way a third-party Web Component library
would be consumed. Concretely:

- `view-badge` and `control-provider-connector` are hand-authored
  `HTMLElement` subclasses using `attachShadow({ mode: "open" })`, each
  with its own `<style>` in the shadow root. No `x-*`/`js-*` vendor prefix
  — checked via grep, that split exists in this app specifically to
  distinguish hand-authored vs. justw-generated **routed** top-level
  components (`x-cartoon` vs. `js-cartoon`), which `connect-kit`'s nested
  elements were never part of to begin with.
- They self-register via `customElements.define(...)` as an import
  side-effect in `connect-kit`'s own `saf/index.ts` — the same
  self-registering spirit as `spi/` providers, but simpler (no strategy
  string, no registry lookup; importing the package is enough).
- A host component (e.g. `CartoonElement.render()`) places
  `<control-provider-connector>` in its template, sets its `.providers`/
  `.connect`/`.list` properties imperatively after the element is in the
  DOM (properties, not attributes — the config includes functions), and
  listens for `CustomEvent`s it dispatches (`connected`, `resource-select`,
  `error`) to react in the host's own state. Full property/event contract
  is decided in ADR-0007.
- Because these tags are never referenced in any `AspectConfig`'s
  `.on([])`/`.except([])`, they are outside DDAS/boot-time validation
  entirely (ADR-0001: only tags targeted by aspect weaving need a
  `registry.gen.ts`/`dom-address-map.json` entry) — no `component.yaml`,
  no route, no generated files.

## Real, counted duplication (evidence, not estimate)

Grepped directly from the current `ai-code-editor` tree before writing
this ADR:

**1. `renderProviderBadge()` — identical in 4 files**, `workspace.ts:250`,
`communication.ts:94`, `socials.ts:68`, `cartoon.ts:90` — same 3-line body
in every copy:

```typescript
function renderProviderBadge(p: { readonly icon?: string; readonly color: string; readonly logo?: string }): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon ?? "");
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
}
```

**2. Credential storage — identical shape in 6 `*_credentials.ts` files**
(`cloud_credentials.ts`, `scm_credentials.ts`, `comms_credentials.ts`,
`socials_credentials.ts`, `pm_credentials.ts`, `cartoon_credentials.ts`),
e.g. `cartoon_credentials.ts`:

```typescript
function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:cartoon-token:${providerId}`;
}
export function getStoredCartoonToken(providerId: string): string {
  try { return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? ""; }
  catch { return ""; }
}
export function setStoredCartoonToken(providerId: string, token: string): void {
  try {
    if (token) globalThis.localStorage?.setItem(tokenStorageKey(providerId), token);
    else globalThis.localStorage?.removeItem(tokenStorageKey(providerId));
  } catch { /* best-effort only */ }
}
```

Every copy differs only in the `providerId` key-prefix string
(`cartoon-token`, `pm-token`, `comms-token`, ...) and the exported function
names.

**3. Grid -> detail -> connect-form -> resource-list — 6 independent
implementations** sharing the same CSS classes
(`.provider-grid`/`.provider-card`/`.connect-form`/`.connect-actions`/
`.connect-status`/`.resource-list`/`.resource-row`) but each hand-coded:
`workspace.ts` (Cloud, SCM, PM — 3 separate render paths in one file),
`communication.ts`, `socials.ts`, `cartoon.ts`. (This is what
`<control-provider-connector>` replaces — decided in ADR-0007.)

## Scope

### In scope (this ADR)

1. Package scaffold: `connect-kit/scm/main` (`@justjs/connect-kit`),
   registered in root `package.json`.
2. `createCredentialStore(namespace: string)` — factory replacing the 6x
   duplicated get/set-token functions. Returns
   `{ get(providerId), set(providerId, token) }`, same
   localStorage-best-effort semantics already proven in every existing
   copy (empty string -> `removeItem`, try/catch swallows storage errors).
   Not a visual concept — a plain function, not a Web Component.
3. `<view-badge>` (`BadgeView`) — a real Custom Element
   (Shadow DOM, `icon`/`color`/`logo` properties), replacing the 4x
   duplicated render-to-string function with the same visual output. Pure
   presentation: no internal state, no dispatched events.

### Out of scope (split to ADR-0007 or excluded entirely)

- `<control-provider-connector>` — the stateful provider-connect flow.
  Decided in [ADR-0007](ADR-0007-connect-kit-provider-connector.md), not here.
- **OAuth-redirect providers (Jira)** and **billed-generate providers
  (Cartoon)** — out of scope for the whole package (both ADRs); see
  ADR-0007's Scope section for the full reasoning.
- **The settings-sheet pattern** (global Anthropic key + Communication's
  own settings) has only 2 real instances — not enough duplication yet to
  justify extraction. Revisit if a 3rd instance appears.
- Retrofitting the 6 existing screens onto the new kit in this same effort
  — see Migration strategy.

## Package location

`connect-kit/scm/main` (`@justjs/connect-kit`) — a new top-level workspace,
placed alongside `cloud-connect/scm/main`, `pm-connect/scm/main`, etc.
(existing precedent: every `*-connect` package already lives at repo root,
not nested under `aop/`). It is registered in root `package.json`'s
`workspaces` array and build/typecheck filter chains the same way
`image-connect` was added this session.

It follows the same SAF shape as every other workspace (ADR-0001's hard
invariant), with one deliberate simplification: no `spi/` is required.
`spi/` exists for **extension points resolved by strategy name at
runtime** (`justjs.providers.register()`); `connect-kit` has no such
concept — a screen imports `createCredentialStore` and the custom elements
directly, there is nothing to swap by string key. `src/spi/` may still
exist empty (S8 in ADR-0001's invariant table is a warning, not an error,
if absent).

`provider_connector_control.ts` (ADR-0007's element) lives in this same
package/directory tree — the two ADRs split the *design decision*, not the
physical package.

```
connect-kit/scm/main/src/
  api/
    credential_store.ts     # CredentialStore interface
    provider_catalog.ts     # ProviderCatalogEntry, ConnectConfig types (shared by both elements)
    connect_events.ts       # ConnectedEvent/ResourceSelectEvent/ConnectErrorEvent types (ADR-0007)
  core/
    credential_store.ts     # DefaultCredentialStore (localStorage-backed)
    badge_view.ts                 # BadgeView (HTMLElement, Shadow DOM) - this ADR
    provider_connector_control.ts      # ProviderConnectorControl (HTMLElement, Shadow DOM) - ADR-0007
    grid_view.ts / toggle_view.ts / form_view.ts / list_view.ts / ...   # the rest of this package's view/control elements, one file per ADR-0008 through ADR-0016
  saf/
    index.ts               # createCredentialStore();
                            # registers "view-badge" (this ADR) and
                            # "control-provider-connector" (ADR-0007) via
                            # customElements.define() as an import side-effect
```

## Migration strategy

Build `connect-kit` fresh; do not touch the 6 existing screens in the same
change. Retrofitting all 6 at once risks regressing ~300 already-passing
`verify_web.mjs` assertions for a purely cosmetic/structural win. For this
ADR's scope specifically:

1. Ship the package scaffold, `createCredentialStore`, and
   `<view-badge>`, verified in isolation with their own test
   suite.
2. Replace the credential-store implementation in at least one real
   `*_credentials.ts` file (`cartoon_credentials.ts` recommended).
3. Replace all 4 local `renderProviderBadge()` copies with
   `<view-badge>`.
4. `<control-provider-connector>`'s migration (Socials, the first real
   stateful consumer) is scoped under ADR-0007, not here.

## Known limitations (disclosed, not papered over)

- This ADR alone does not reduce the 6x connect-form duplication — that's
  ADR-0007's scope. Shipping only this ADR still leaves every screen's
  grid/detail/form/list logic hand-written.
- Moving to Shadow DOM is a real, non-free styling cost, not a drop-in
  swap: the existing `.provider-icon` rule in `app.css` is global and
  won't reach inside a shadow root. It needs to be ported into
  `<view-badge>`'s own `<style>` block (and can drift from the
  global copy until every screen migrates) — the exact CSS a screen
  visually needs stays the same, only where it's declared changes.

## Acceptance criteria

- [ ] `connect-kit/scm/main` exists, passes ADR-0001's SAF structure
      invariants (S1-S17, `spi/` may be empty)
- [ ] `createCredentialStore(namespace)` ships with tests, and replaces
      the implementation (not just the export) in at least one real
      `*_credentials.ts` file
- [ ] `<view-badge>` ships with tests, matching existing visual
      output (icon/logo/color rendering) of the current 4 duplicated copies
- [ ] All 4 local `renderProviderBadge()` copies removed from
      `ai-code-editor`, replaced with `<view-badge>`
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- ADR-0001 (workspace layout, SAF structure invariants)
- [ADR-0007](ADR-0007-connect-kit-provider-connector.md) — the stateful
  `<control-provider-connector>` element, split out deliberately
- Real duplication introduced across this session's `cloud-connect`,
  `scm-connect`, `comms-connect`, `social-connect`, `pm-connect`,
  `image-connect` rounds (all six `ai-code-editor` provider-connect
  screens)
- Tracked by justjs#97 (epic), with sub-issues justjs#98 (scaffold),
  justjs#99 (credential-store factory), justjs#100 (view element)
