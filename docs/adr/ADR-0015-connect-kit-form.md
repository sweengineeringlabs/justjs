# ADR-0015: `@justjs/component-view` — reusable form view component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

The credential-entry step inside every one of the 6 provider-connect
screens is a small form: either one password-type input (bearer token) or
two inputs (identifier+password, client ID+secret, access key+secret
key, API key+token — 4 real 2-field shapes across Bluesky/Reddit/AWS/
Trello/Jira). Extract the rendering of that step as `<view-form>`, to be
composed by `<control-provider-connector>` (ADR-0007).

## Real, counted duplication (evidence, not estimate)

Single-field form (`cartoon.ts:179`, and the same shape in
`communication.ts`/`socials.ts`'s bearer branch/`workspace.ts`'s SCM and
PM bearer branches):

```typescript
<input id="cartoon-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} API key" autocomplete="off" spellcheck="false" />
```

Two-field forms — 4 real, distinct shapes, all following the identical
"two labeled inputs + Connect/Reconnect + Disconnect" wrapper
(`socials.ts:205-216`, `workspace.ts:921-927`,
`workspace.ts:1394-1400`, `workspace.ts:1381-1382`):

```typescript
// Bluesky (socials.ts)
<input id="socials-connect-identifier" type="text" placeholder="Bluesky handle or email" autocomplete="off" spellcheck="false" />
<input id="socials-connect-app-password" type="password" placeholder="App Password" autocomplete="off" spellcheck="false" />

// AWS (workspace.ts)
<input id="cloud-connect-access-key" type="text" placeholder="AWS access key ID" autocomplete="off" spellcheck="false" />
<input id="cloud-connect-secret-key" type="password" placeholder="AWS secret access key" autocomplete="off" spellcheck="false" />

// Trello (workspace.ts)
<input id="pm-connect-api-key" type="text" placeholder="Trello API key" autocomplete="off" spellcheck="false" />
<input id="pm-connect-token" type="password" placeholder="Trello token" autocomplete="off" spellcheck="false" />

// Jira (workspace.ts)
<input id="pm-connect-client-id" type="text" placeholder="Atlassian OAuth app Client ID" autocomplete="off" spellcheck="false" />
<input id="pm-connect-client-secret" type="password" placeholder="Atlassian OAuth app Client Secret" autocomplete="off" spellcheck="false" />
```

Every one wrapped identically:

```typescript
<div class="connect-form">
  ${form}
  <div class="connect-actions">
    <button id="X-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
    ${connected ? `<button id="X-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
  </div>
  <p id="X-connect-status" class="connect-status${error ? " connect-status-error" : ""}">...</p>
</div>
```

The status line at the bottom is already `<view-status-line>`'s job
(ADR-0009) — this ADR covers the inputs + Connect/Disconnect buttons only.

## Why this is a `view-*`, not a `control-*`

The form doesn't own whether it's "connecting" or what the result was —
that's `<control-provider-connector>`'s job (ADR-0007), passed in as a
`connecting`/`connected` property. The form itself only renders the
configured fields, reflects whether Disconnect should show, and reports
submitted values — the same "props in, event out, nothing remembered"
shape as `<view-toggle>` and `<view-grid>`.

## Scope

### In scope

`<view-form>` (`FormView`) — Shadow DOM, properties: `fields` (array of
`{id, type: "text" | "password", placeholder}`, 1 or 2 entries, covering
every real shape found above), `connecting` (boolean, disables the
Connect button and changes its label), `connected` (boolean, shows
Disconnect). Dispatches `submit` (`detail: {values: Record<string, string>}`,
keyed by each field's `id`) when Connect is clicked, and `disconnect`
when Disconnect is clicked.

### Out of scope, not guessed at

- Jira's OAuth-specific form (Client ID/Secret fields that trigger a
  browser redirect instead of a synchronous connect) — structurally a
  2-field form visually, but its Connect button behaves completely
  differently (`beginJiraConnect()`, no `submit` event makes sense to
  dispatch since nothing "submits" locally). Out of scope per ADR-0007's
  own OAuth exclusion — `<view-form>` is not used for Jira's screen in v1.
- Field-level validation beyond "required" (e.g. format checks) — none of
  the 6 existing forms do this beyond checking the fields are non-empty,
  which stays the host's job (same "Paste a token first"/"Enter both
  fields" messages already shown today via the status line).

## Design: real Web Component, nested rather than routed

Same reasoning as every sibling ADR: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-form", FormView)` as an import
side-effect, outside DDAS/boot-time validation.

## Migration strategy

Not migrated standalone — ships as part of `<control-provider-connector>`'s
own migration (ADR-0007), since it has no real, independent consumer
outside that composition. Verified in isolation with its own test suite
before ADR-0007 composes it.

## Known limitations (disclosed, not papered over)

- No standalone migration target — this view only proves itself real once
  composed into `<control-provider-connector>` and that element migrates
  Socials (ADR-0007's own migration step).
- Shadow DOM styling cost: `.connect-form`/`.connect-actions` rules in
  `app.css` need porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-form>` ships in `component-view`'s `core`/`saf` with tests
      covering: 1-field render, 2-field render, `submit` dispatched with
      correct `values`, `connecting`/`connected` props change button
      state, `disconnect` dispatched on Disconnect click
- [ ] Composed correctly by `<control-provider-connector>` (verified as part of
      ADR-0007's own acceptance criteria, not duplicated here)
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-provider-connect-package.md) — the sole real
  consumer, `<control-provider-connector>`
- [ADR-0009](ADR-0009-connect-kit-status-line.md) — `<view-status-line>`,
  the sibling piece handling the status line below this form
- ADR-0001 (workspace layout, SAF structure invariants)
