# ADR-0011: `@justjs/component-view` — reusable prompt-field view component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Five files hand-roll the identical "describe what you want" labeled
textarea (`cartoon.ts`, `scaffold.ts`×2, `workspace.ts`×2). Extract the
plain field as `<view-prompt-field>`. Voice/mic input, present on 2 of the
5, is deliberately excluded from v1 — see
[Why voice input is out of scope](#why-voice-input-is-out-of-scope).

## Real, counted duplication (evidence, not estimate)

`cartoon.ts:228` — bare textarea, no mic:

```typescript
<textarea id="cartoon-prompt" rows="3" placeholder="Describe what to draw, e.g. a fox riding a skateboard"></textarea>
```

`scaffold.ts:54-59` — labeled, wrapped with a mic button:

```typescript
<label class="field">
  <span class="field-label">Describe the file to generate</span>
  <div class="field-with-mic">
    <textarea id="scaffold-description" rows="4" placeholder="e.g. a debounce utility function"></textarea>
    ${micButton("scaffold-description-mic-btn")}
  </div>
</label>
```

Same shape again at `scaffold.ts:72` (`scaffold-project-description`) and
in `workspace.ts` (Design's `design-description`, Slides'
`slides-description`) — 5 real instances, inconsistent wrapping (some
labeled, some not; some with a mic button, some without).

## Why voice input is out of scope

Checked `scaffold.ts`'s `setupVoiceButton`/`startHold` **and** `chat.ts`'s
`setupVoicePrompt`/`startHold` directly (correction: an earlier pass of
this ADR said "2 mic instances, both in `scaffold.ts`" — wrong, `chat.ts`
has its own independent third instance, targeting the chat input rather
than a textarea): the mic button is not a decoration on the textarea,
it's a genuinely separate, stateful piece — it owns a `voiceHandle` (a
live `startVoicePrompt()` session), a hold-to-record gesture
(`pointerdown`/`pointerup`/`pointercancel`/`pointerleave`), live
transcript streaming into the target field as the user speaks, and
cleanup on `disconnectedCallback()`. That is real, substantial
`control-*`-shaped behavior in its own right — folding it into a "prompt
field" view would either force the view to own state (contradicting what
a view is) or require a second, more complex element this ADR hasn't
scoped. 3 real instances across 2 files (`chat.ts`, `scaffold.ts`) is
real, counted evidence for a dedicated `<control-voice-input>` element —
not yet scoped in its own ADR as of this writing; revisit when that work
is prioritized.

## Scope

### In scope

`<view-prompt-field>` (`PromptFieldView`) — Shadow DOM, properties:
`label` (optional string — omitted renders no `<label>`, matching
`cartoon.ts`'s bare-textarea case), `placeholder` (string), `rows`
(number, default matching current usage), `value` (string, two-way: set
to populate, read to get current text). No internal state beyond the
textarea's own value — pure view.

### Out of scope, not guessed at

- Voice/mic input — see above.
- Cost disclosure / Generate button (Cartoon's own concern, already
  excluded from `<control-provider-connector>` per ADR-0007 — this ADR
  covers only the bare labeled textarea, not what sits around it).

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006 through ADR-0010: `HTMLElement` subclass,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-registers
via `customElements.define("view-prompt-field", PromptFieldView)` as an
import side-effect, outside DDAS/boot-time validation.

## Migration strategy

1. Ship `<view-prompt-field>`, verified in isolation.
2. Migrate exactly **one** existing screen as the first real consumer —
   `cartoon.ts` (the only bare, no-mic, no-label instance — the simplest
   possible fit, proving the element without touching the voice-input
   question at all).
3. Migrate `scaffold.ts`'s 2 copies and `workspace.ts`'s 2 copies
   opportunistically — `scaffold.ts`'s migration will need to keep its
   existing hand-written mic button working alongside the new element
   (e.g. slotting it in) until/unless ADR-0007's voice-input follow-up
   lands.

## Known limitations (disclosed, not papered over)

- Only `cartoon.ts` migrates as part of this ADR's issues — the 4 other
  copies (2 with mic buttons) keep their hand-written markup until
  migrated individually, and the mic-button copies specifically can't fully
  migrate until voice input has its own design.
- Shadow DOM styling cost: `.field`/`.field-label` rules in `app.css` need
  porting into this element's own `<style>` block.

## Acceptance criteria

- [ ] `<view-prompt-field>` ships in `component-view`'s `core`/`saf` with
      tests covering: label present/absent render, placeholder/rows
      applied, `value` set and read back
- [ ] `cartoon.ts` migrated to `<view-prompt-field>`, `verify_web.mjs`
      passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-provider-connect-package.md) — Cartoon's generate flow,
  which this ADR's field sits inside but does not itself cover
- ADR-0001 (workspace layout, SAF structure invariants)
