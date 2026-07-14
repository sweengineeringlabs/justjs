# ADR-0006: Extract `@justjs/connect-kit` — reusable provider-connect UI

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

`ai-code-editor` now has six independent, hand-written implementations of
the same provider-connect screen (grid of providers -> detail view ->
credential form -> resource list), plus a byte-for-byte duplicated badge
renderer and a byte-for-byte duplicated credential-storage helper. Extract
the real, repeated parts into a new package, `@justjs/connect-kit`, rather
than continuing to hand-copy this pattern into every new `*-connect`
integration.

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

## Design: real Web Components, nested rather than routed

The visual pieces (provider badge, provider-connect flow) ship as real
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

- `justjs-provider-badge` and `justjs-provider-connect` are hand-authored
  `HTMLElement` subclasses using `attachShadow({ mode: "open" })`, each
  with its own `<style>` in the shadow root.
- They self-register via `customElements.define(...)` as an import
  side-effect in `connect-kit`'s own `saf/index.ts` — the same
  self-registering spirit as `spi/` providers, but simpler (no strategy
  string, no registry lookup; importing the package is enough).
- A host component (e.g. `CartoonElement.render()`) places
  `<justjs-provider-connect>` in its template, sets its `.providers`/
  `.connect`/`.list` properties imperatively after the element is in the
  DOM (properties, not attributes — the config includes functions), and
  listens for `CustomEvent`s it dispatches (`connected`, `resource-select`,
  `error`) to react in the host's own state.
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
`communication.ts`, `socials.ts`, `cartoon.ts`.

## Scope

### In scope

1. `createCredentialStore(namespace: string)` — factory replacing the 6x
   duplicated get/set-token functions. Returns `{ get(providerId), set(providerId, token) }`,
   same localStorage-best-effort semantics already proven in every existing
   copy (empty string -> `removeItem`, try/catch swallows storage errors).
2. `<justjs-provider-badge>` — a real Custom Element (Shadow DOM,
   `icon`/`color`/`logo` properties), replacing the 4x duplicated
   render-to-string function with the same visual output.
3. `<justjs-provider-connect>` — a real Custom Element covering the
   **common case**: provider grid -> tap -> single-field or two-field
   bearer-style credential form -> Connect -> resource list. Configured
   via a `.providers` catalog property (id/name/icon/color/logo) plus
   caller-supplied `.connect(config)` / `.list(session)` function
   properties — the element renders and manages selection/loading/error
   state internally and dispatches `CustomEvent`s for the host to react
   to; the caller supplies the actual network calls (already implemented
   per-package in each `*-connect` SAF).

### Out of scope, not guessed at

- **OAuth-redirect providers (Jira)** are a real, different flow (external
  redirect, URL callback parsing, no synchronous `connect()` return) and
  are explicitly NOT covered by v1 of the connect-kit's form component.
  Jira's screen stays hand-written until a second real OAuth consumer
  exists to justify generalizing it — one example is not a pattern.
- **Billed-generate providers (Cartoon)** have a fundamentally different
  action shape (`generate()` behind a cost disclosure, not `list()`
  returning resources) and are explicitly NOT covered by v1's resource-list
  component. Cartoon's screen stays hand-written.
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
concept — a screen imports `createCredentialStore` and the two custom
elements directly, there is nothing to swap by string key. `src/spi/` may
still exist empty (S8 in ADR-0001's invariant table is a warning, not an
error, if absent).

```
connect-kit/scm/main/src/
  api/
    credential_store.ts     # CredentialStore interface
    provider_catalog.ts     # ProviderCatalogEntry, ConnectConfig types
    connect_events.ts       # ConnectedEvent/ResourceSelectEvent/ConnectErrorEvent types
  core/
    credential_store.ts     # DefaultCredentialStore (localStorage-backed)
    provider_badge_element.ts    # ProviderBadgeElement (HTMLElement, Shadow DOM)
    provider_connect_element.ts  # ProviderConnectElement (HTMLElement, Shadow DOM)
  saf/
    index.ts               # createCredentialStore();
                            # registers "justjs-provider-badge" and
                            # "justjs-provider-connect" via customElements.define()
                            # as an import side-effect
```

## Migration strategy

Build `connect-kit` fresh; do not touch the 6 existing screens in the same
change. Retrofitting all 6 at once risks regressing ~300 already-passing
`verify_web.mjs` assertions for a purely cosmetic/structural win. Instead:

1. Ship `connect-kit` v1 (credential store + the two custom elements),
   verified in isolation with its own test suite (jsdom/happy-dom-based
   Shadow DOM assertions, matching the harness `comms-connect` already
   proved out this session).
2. Migrate exactly **one** existing screen as the first real consumer —
   Socials (`socials.ts`), chosen because it has no OAuth provider and no
   generate/billing variant, making it the closest fit to the kit's v1
   scope. This proves the kit end-to-end against a real screen without
   touching OAuth or billed-generate logic.
3. Migrate the remaining screens opportunistically (next time each is
   touched for an unrelated reason), not as a dedicated sweep.

## Known limitations (disclosed, not papered over)

- v1 does not cover OAuth-redirect or billed-generate flows — Jira and
  Cartoon stay hand-written indefinitely unless a second real instance of
  either shape appears.
- Only one migrated consumer (Socials) will exist after this ADR's issues
  close — the other 5 screens keep their duplicated code until migrated
  individually. The duplication this ADR documents will not fully
  disappear immediately.
- Moving to Shadow DOM is a real, non-free styling cost, not a drop-in
  swap: the existing `.provider-*`/`.connect-*`/`.resource-*` rules in
  `app.css` are global and won't reach inside a shadow root. They need to
  be ported into each element's own `<style>` block (and can drift from
  the global copies until every screen migrates) — the exact CSS a screen
  visually needs stays the same, only where it's declared changes.
- `ProviderConnectElement`'s exact property/event surface is a design
  decision for the implementing issue, not fixed by this ADR — the
  grid/detail/form/list states are fixed, the config and event names are
  not.

## Acceptance criteria

- [ ] `connect-kit/scm/main` exists, passes ADR-0001's SAF structure
      invariants (S1-S17, `spi/` may be empty)
- [ ] `createCredentialStore(namespace)` ships with tests, and replaces
      the implementation (not just the export) in at least one real
      `*_credentials.ts` file
- [ ] `<justjs-provider-badge>` ships with tests, matching existing visual
      output (icon/logo/color rendering) of the current 4 duplicated copies
- [ ] `<justjs-provider-connect>` ships with tests covering grid/detail/
      connect-form/resource-list states and its dispatched events,
      explicitly excluding OAuth and generate/billing variants
- [ ] Socials tab (`socials.ts`) migrated to consume `connect-kit`'s two
      elements, `verify_web.mjs` passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- ADR-0001 (workspace layout, SAF structure invariants)
- Real duplication introduced across this session's `cloud-connect`,
  `scm-connect`, `comms-connect`, `social-connect`, `pm-connect`,
  `image-connect` rounds (all six `ai-code-editor` provider-connect
  screens)
- Tracked by justjs#97 (epic), with sub-issues justjs#98 (scaffold),
  justjs#99 (credential-store factory), justjs#100 (badge renderer),
  justjs#101 (connect-form UI kit), justjs#102 (Socials migration)
