# ADR-0007: `@justjs/provider-connect` — package scaffold + provider-connector control

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Split out from [ADR-0006](ADR-0006-component-view-package.md) to review the
stateful, higher-risk, `ai-code-editor`-specific piece independently: a
new package, `@justjs/provider-connect`, holding `<control-provider-connector>`
(a real Custom Element covering provider grid -> tap -> credential form ->
Connect -> resource list, replacing 6 independent hand-written
implementations — `workspace.ts`'s Cloud/SCM/PM, `communication.ts`,
`socials.ts`, `cartoon.ts`) and `createCredentialStore()`.

This ADR does **not** propose retrofitting all 6 existing screens — see
[Migration strategy](#migration-strategy).

## Why a separate package from `component-view`

`@justjs/component-view` (ADR-0006) ships 10 generic view components with
zero dependency on any provider concept — confirmed by real cross-app
evidence (`cross-target-demo`'s login form, `agentic-memory-demo`'s
search/add-memory forms and widget-action tiles independently match
several of those views' shapes). This package is the opposite: its entire
API is built around `ai-code-editor`'s own provider concept
(`CloudProvider`/`ScmProvider`/`CommsProvider`/`SocialProvider`/
`PmProvider`), and `createCredentialStore()` — while not itself
provider-specific in its implementation — only has real callers here, all
storing provider credentials. Bundling both concerns into one package
would force any future consumer that only wants the generic views (a
login form, a search form) to pull in provider-specific code it will
never use. `provider_connect` depends on `component_view` (one-directional
— `component-view` never imports anything from this package).

## Naming

**Package**: `provider-connect` — matches this repo's existing
`<domain>-connect` convention exactly (`cloud-connect`, `scm-connect`,
`comms-connect`, `social-connect`, `pm-connect`, `image-connect`), domain
= "provider" since this package is the generic orchestration layer sitting
above all of those domain-specific `*-connect` packages. Package names in
this repo don't follow the bare-verb tag-naming rule below — that rule is
about Custom Element tags reading like labeled things on a page, which
doesn't apply to package names (same reason `cloud-connect` etc. are all
named with a bare "connect" already).

**Tag/class**: `<control-provider-connector>` / `ProviderConnectorControl`
— naming history: `<control-provider-connect>` (bare verb, no object) ->
briefly `<control-provider-flow>` (fixed the verb problem but implied more
generality than this element has — it explicitly excludes Jira's OAuth
flow and Cartoon's billed-generate flow) -> settled on
`provider-connector`, which also matches vocabulary already real in this
codebase: `BEARER_CONNECTORS`/`SCM_CONNECTORS`/`PM_CONNECTORS`/
`COMMS_CONNECTORS`/`CARTOON_CONNECTORS` are existing variable names for
"the function that does the connecting," in every one of the 6 screens
this element replaces.

## Why `<control-provider-connector>` is a real control, not decomposed further

Unlike `<view-grid>` (ADR-0014), `<view-toggle>` (ADR-0012), and the
image-attach views (ADR-0010) — all reclassified from control to view
once checked, because their "state" turned out to be data the host
already owned — this element is different: the sequencing itself (which
step you're on, whether a connect call is in flight, whether it
succeeded) is not data any external host currently owns; it's exactly
what's independently reimplemented 6 times today. Composing pure views
for the *rendering* of each step doesn't remove the need for something to
own *which step you're on and drive the actual async calls* — that
orchestration is real, owned state, the same bar `<control-image-attach>`
(now decomposed away, ADR-0010) was originally justified by before its
own reconsideration showed the async work was already shared elsewhere.
Here, it isn't shared elsewhere — the state machine is the duplication.

## Real, counted duplication (evidence — full detail in ADR-0006)

Six independent implementations of the same grid -> detail -> connect-form
-> resource-list sequence, sharing CSS classes
(`.provider-grid`/`.provider-card`/`.connect-form`/`.connect-actions`/
`.connect-status`/`.resource-list`/`.resource-row`) but with zero shared
render/state logic: `workspace.ts` (Cloud, SCM, PM — 3 separate render
paths in one file), `communication.ts`, `socials.ts`, `cartoon.ts`.
Credential storage — identical shape in 6 `*_credentials.ts` files, each
differing only in the `providerId` key-prefix string and exported
function names.

## Scope

### In scope

1. Package scaffold: `provider-connect/scm/main` (`@justjs/provider-connect`),
   registered in root `package.json`, depending on `@justjs/component-view`.
2. `createCredentialStore(namespace: string)` — factory replacing the 6x
   duplicated get/set-token functions. Returns
   `{ get(providerId), set(providerId, token) }`, same
   localStorage-best-effort semantics already proven in every existing
   copy (empty string -> `removeItem`, try/catch swallows storage errors).
   Not a visual concept — a plain function, not a Web Component.
3. `<control-provider-connector>` (`ProviderConnectorControl`) — a real
   Custom Element (`HTMLElement` subclass, `attachShadow({mode: "open"})`)
   covering the **common case**: single- or two-field bearer-style
   credential form. Configured via a `.providers` catalog property
   (id/name/icon/color/logo) plus caller-supplied `.connect(config)` /
   `.list(session)` function properties — the caller supplies the actual
   network calls (already implemented per-package in each `*-connect`
   SAF), the element owns which step it's on
   (grid/form/connecting/error/list) and dispatches `CustomEvent`s
   (`connected`, `resource-select`, `error`) for the host to react to.

**Composes, from `@justjs/component-view`, rather than hand-renders, its
own steps:**
- `<view-grid>` for the provider-selection step — passing `selected` per
  item computed from its own `isProviderConnected()` check (data it
  already owns), listening for `item-select`.
- `<view-form>` for the credential-entry step — passing the field config
  (1 or 2 inputs, matching each provider's `kind`), listening for `submit`.
- `<view-status-line>` for the connecting/error status line.
- `<view-list>` for the resource-list step, once connected.
- `<view-badge>`, composed inside `<view-grid>`, for each provider-card
  icon (unchanged from the original scoping).

This element's own remaining responsibility, after composing those views,
is genuinely thin: track which step is current, call
`.connect()`/`.list()` at the right time, and translate their results
into props on the next view down. That's the real, non-decomposable
"control" left once the rendering is factored out.

### Out of scope, not guessed at

- **OAuth-redirect providers (Jira)** are a real, different flow (external
  redirect, URL callback parsing, no synchronous `connect()` return) and
  are explicitly NOT covered by v1. Jira's screen stays hand-written until
  a second real OAuth consumer exists to justify generalizing it — one
  example is not a pattern.
- **Billed-generate providers (Cartoon)** have a fundamentally different
  action shape (`generate()` behind a cost disclosure, not `list()`
  returning resources) and are explicitly NOT covered by v1. Cartoon's
  screen stays hand-written.
- Retrofitting all 6 existing screens onto this element in this same
  effort — only Socials migrates as part of this ADR; see Migration
  strategy.

## Package location

`provider-connect/scm/main` (`@justjs/provider-connect`) — a new top-level
workspace, following the exact `<domain>-connect` convention already used
by `cloud-connect`/`scm-connect`/`comms-connect`/`social-connect`/
`pm-connect`/`image-connect`, registered in root `package.json`'s
`workspaces` array and build/typecheck filter chains. Declares a real
dependency on `@justjs/component-view`.

Follows the same SAF shape as every other workspace, same `spi/`
simplification as `component-view` (no strategy-resolved extension
points).

```
provider-connect/scm/main/src/
  api/
    credential_store.ts   # CredentialStore interface
    connect_events.ts      # ConnectedEvent/ResourceSelectEvent/ConnectErrorEvent types
  core/
    credential_store.ts             # DefaultCredentialStore (localStorage-backed)
    provider_connector_control.ts   # ProviderConnectorControl (HTMLElement, Shadow DOM)
                                     # imports view-grid/view-form/view-list/
                                     # view-status-line from @justjs/component-view
  saf/
    index.ts   # createCredentialStore();
                # registers "control-provider-connector" via
                # customElements.define() as an import side-effect
```

## Migration strategy

1. Ship the package scaffold, `createCredentialStore`, and
   `<control-provider-connector>`, verified in isolation with its own
   test suite (jsdom/happy-dom-based Shadow DOM assertions, matching the
   harness `comms-connect` already proved out this session) — including
   tests that it correctly composes and reacts to events from
   `@justjs/component-view`'s `<view-grid>`/`<view-form>`/`<view-list>`/
   `<view-status-line>`, not just its own markup.
2. Replace the credential-store implementation in at least one real
   `*_credentials.ts` file (`cartoon_credentials.ts` recommended).
3. Migrate exactly **one** existing screen as the first real consumer —
   Socials (`socials.ts`), chosen because it has no OAuth provider and no
   generate/billing variant, making it the closest fit to this element's
   v1 scope. This proves the element end-to-end against a real screen
   without touching OAuth or billed-generate logic.
4. Migrate the remaining 5 screens opportunistically (next time each is
   touched for an unrelated reason), not as a dedicated sweep.

## Known limitations (disclosed, not papered over)

- v1 does not cover OAuth-redirect or billed-generate flows — Jira and
  Cartoon stay hand-written indefinitely unless a second real instance of
  either shape appears.
- Only one migrated consumer (Socials) will exist after this ADR's issues
  close — the other 5 screens keep their duplicated code until migrated
  individually.
- This ADR depends on `@justjs/component-view` (ADR-0006, ADR-0009,
  ADR-0014, ADR-0015, ADR-0016) all being available — its own implementing
  issue is sequenced after theirs, not parallel to them.
- Moving to Shadow DOM means the existing `.provider-grid`/`.connect-*`/
  `.resource-*` rules in `app.css` need to be ported into the composed
  views' own `<style>` blocks — real work, and they can drift from the
  global copies until every screen migrates.
- `ProviderConnectorControl`'s exact property/event surface is a design
  decision for the implementing issue, not fully fixed by this ADR — the
  grid/form/list states and which views they compose are fixed, the
  precise config and event names are not.

## Acceptance criteria

- [ ] `provider-connect/scm/main` exists, passes ADR-0001's SAF structure
      invariants, declares a real dependency on `@justjs/component-view`
- [ ] `createCredentialStore(namespace)` ships with tests, and replaces
      the implementation (not just the export) in at least one real
      `*_credentials.ts` file
- [ ] `<control-provider-connector>` ships with tests covering grid/form/
      connecting/error/list states, composing
      `<view-grid>`/`<view-form>`/`<view-list>`/`<view-status-line>`
      correctly, explicitly excluding OAuth and generate/billing variants
- [ ] Socials tab (`socials.ts`) migrated to consume
      `<control-provider-connector>`, `verify_web.mjs` passes with no
      assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — `@justjs/component-view`,
  this package's dependency, `<view-badge>`
- [ADR-0009](ADR-0009-connect-kit-status-line.md) — `<view-status-line>`,
  composed here
- [ADR-0014](ADR-0014-connect-kit-tile-grid.md) — `<view-grid>`, composed
  here
- [ADR-0015](ADR-0015-connect-kit-form.md) — `<view-form>`, composed here
- [ADR-0016](ADR-0016-connect-kit-list.md) — `<view-list>`, composed here
- ADR-0001 (workspace layout, SAF structure invariants)
- Tracked by justjs#97 (epic), with sub-issues justjs#99
  (credential-store factory), justjs#101 (provider-connector element),
  justjs#102 (Socials migration)
