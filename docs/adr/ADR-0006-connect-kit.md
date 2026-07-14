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
2. `renderProviderBadge(provider)` — the shared render helper, replacing
   the 4x duplicated function verbatim (same signature, same output).
3. A config-driven provider-connect UI kit covering the **common case**:
   provider grid -> tap -> single-field or two-field bearer-style
   credential form -> Connect -> resource list. Parameterized by a
   provider catalog (id/name/icon/color/logo) plus caller-supplied
   `connect(config)` / `list(session)` functions — the kit renders and
   manages selection/loading/error state, the caller supplies the actual
   network calls (already implemented per-package in each `*-connect`
   SAF).

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
concept — a screen imports `createCredentialStore`/`renderProviderBadge`/
the connect-form component directly, there is nothing to swap by string
key. `src/spi/` may still exist empty (S8 in ADR-0001's invariant table is
a warning, not an error, if absent).

```
connect-kit/scm/main/src/
  api/
    credential_store.ts   # CredentialStore interface
    provider_catalog.ts   # ProviderCatalogEntry, ConnectFormConfig types
  core/
    credential_store.ts   # DefaultCredentialStore (localStorage-backed)
    provider_badge.ts     # renderProviderBadge implementation
    connect_form.ts       # provider grid / detail / connect-form / resource-list
  saf/
    index.ts              # createCredentialStore(), renderProviderBadge(),
                           # createProviderConnectElement()
```

## Migration strategy

Build `connect-kit` fresh; do not touch the 6 existing screens in the same
change. Retrofitting all 6 at once risks regressing ~300 already-passing
`verify_web.mjs` assertions for a purely cosmetic/structural win. Instead:

1. Ship `connect-kit` v1 (credential store + badge + connect-form kit),
   verified in isolation with its own test suite.
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
- `createProviderConnectElement`'s exact API shape is a design decision for
  the implementing issue, not fixed by this ADR — the grid/detail/form/list
  states are fixed, the config surface is not.

## Acceptance criteria

- [ ] `connect-kit/scm/main` exists, passes ADR-0001's SAF structure
      invariants (S1-S17, `spi/` may be empty)
- [ ] `createCredentialStore(namespace)` ships with tests, and replaces
      the implementation (not just the export) in at least one real
      `*_credentials.ts` file
- [ ] `renderProviderBadge()` ships with tests, matching existing output
      byte-for-byte
- [ ] Provider-connect UI kit ships with tests covering grid/detail/
      connect-form/resource-list states, explicitly excluding OAuth and
      generate/billing variants
- [ ] Socials tab (`socials.ts`) migrated to consume `connect-kit`,
      `verify_web.mjs` passes with no assertion count regression
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
