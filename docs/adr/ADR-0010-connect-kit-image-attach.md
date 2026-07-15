# ADR-0010: `@justjs/component-view` — reusable image-attach view components

- **Status:** Accepted
- **Date:** 2026-07-14

## Summary

Three files hand-roll the identical "attach a screenshot" flow: a file
input, a preview thumbnail, a Remove button, an error line, and real
validation/`FileReader` logic. Extract the two *visual* states as pure
views, `<view-image-attach>` (before) and `<view-image-picker>` (after) —
no control component needed at all, see
[Why no control component](#why-no-control-component).

## Real, counted duplication (evidence, not estimate)

`scaffold.ts:184-234` (`handleImageSelected`/`clearPendingImage`/
`showImageError`), duplicated in near-identical shape in `chat.ts` and
`review.ts`:

```typescript
private async handleImageSelected(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  if (!isSupportedImageType(file.type)) {
    this.showImageError("Unsupported image type - use PNG, JPEG, WebP, or GIF.");
    input.value = "";
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    this.showImageError(`Image too large (max ${MAX_IMAGE_MB}MB).`);
    input.value = "";
    return;
  }
  const dataUrl = await readImageFileAsDataUrl(file);
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    this.showImageError("Couldn't read that image - try a different file.");
    input.value = "";
    return;
  }
  this.hideImageError();
  this.pendingProjectImage = parsed;
  // ...update thumbnail src, unhide preview
}

private clearPendingImage(): void {
  this.pendingProjectImage = null;
  // ...reset file input, hide preview, hide error
}
```

Markup (`.attach-image-preview`/`.attach-image-label`/`.attach-image-error`,
plus a `btn-secondary`-styled Remove button) is shared identically across
`chat.ts`, `scaffold.ts`, `review.ts` — 3 real instances.

**Crucially:** `isSupportedImageType`, `readImageFileAsDataUrl`, and
`parseDataUrl` are **already** plain, non-visual functions in
`core/images.ts` — shared, not duplicated, today. Only the *rendering*
(the before/after markup and the wiring between them) is duplicated
3 times, not the validation/reading logic itself.

## Why no control component

Originally scoped as `<control-image-attach>`. Reconsidered: the actual
async work (validate type/size, read the file, build a data URL) is
already a shared, non-visual utility, called directly by each of the 3
hosts today — it was never independently reimplemented, only the
markup around it was. Wrapping that in a `component-view` control would mean
either re-implementing already-shared logic inside a new component, or
having the control just forward to `core/images.ts` — adding a layer that
does nothing `ReviewElement`/`ChatElement`/`ScaffoldElement` (all
already real, stateful components) can't do themselves by calling the
existing plain functions directly. So: two pure views for the two visual
states, no control. The host owns the actual attach/validate/clear
sequence — same as it does today, just against reusable markup instead
of hand-rolled `innerHTML`.

## Scope

### In scope

**`<view-image-attach>`** (`ImageAttachView`) — Shadow DOM, properties:
`accept` (optional MIME allow-list, defaults to the current
PNG/JPEG/WebP/GIF set), `label` (the trigger button's text, e.g.
"📷 Attach screenshot"). Renders the trigger button + a hidden file
input. Dispatches `files-select` (`detail: {files: FileList}`) when the
user picks a file — no validation, no reading, a pure relay of the
native picker.

**`<view-image-picker>`** (`ImagePickerView`) — Shadow DOM, properties:
`dataUrl` (the image to preview, or empty/absent to stay hidden), `label`
(defaults to "Screenshot attached"), `error` (optional error message to
show instead of/alongside the preview). Renders the thumbnail + label +
Remove button (+ error line). Dispatches `clear` when Remove is clicked.

The host wires them together: listens for `<view-image-attach>`'s
`files-select`, calls the existing `isSupportedImageType`/
`readImageFileAsDataUrl`/`parseDataUrl` functions itself, sets `error` or
`dataUrl` on `<view-image-picker>` accordingly, and listens for its
`clear` to reset its own pending-image state — exactly the sequence
`handleImageSelected`/`clearPendingImage` already run today, just
against two reusable views instead of hand-rolled markup.

### Out of scope, not guessed at

- What happens to the attached image after attachment (sending it to an
  AI review, a scaffold prompt, a chat message) — that's each host's own
  business logic, unchanged.
- Multi-image attachment — none of the 3 existing copies support more
  than one image at a time; not invented speculatively.
- Promoting `isSupportedImageType`/`readImageFileAsDataUrl`/`parseDataUrl`
  into `component-view` itself — they stay in `core/images.ts`, imported by
  each host as they already are. Nothing about this ADR requires moving
  them.

## Design: real Web Components, nested rather than routed

Same reasoning as ADR-0006 through ADR-0009: `HTMLElement` subclasses,
`attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix, self-register
via `customElements.define("view-image-attach", ImageAttachView)` and
`customElements.define("view-image-picker", ImagePickerView)` as import
side-effects, outside DDAS/boot-time validation.

## Migration strategy

1. Ship both views, verified in isolation (`<view-image-attach>`:
   `files-select` dispatched with the picked file(s); `<view-image-picker>`:
   renders/hides based on `dataUrl`, shows `error`, `clear` dispatched on
   Remove click).
2. Migrate exactly **one** existing screen as the first real consumer —
   `review.ts` (its attached image is used exactly once, for a single AI
   review call, the simplest real consumption site to verify against).
3. Migrate `chat.ts` and `scaffold.ts` opportunistically, not as a
   dedicated sweep.

## Known limitations (disclosed, not papered over)

- Only `review.ts` migrates as part of this ADR's issues — `chat.ts` and
  `scaffold.ts` keep their hand-written copies until migrated individually.
- Shadow DOM styling cost: `.attach-image-preview`/`.attach-image-label`/
  `.attach-image-error` rules in `app.css` need porting into these
  elements' own `<style>` blocks.
- Each host still owns real orchestration logic (calling the validation/
  read functions, deciding what to set on `<view-image-picker>`) — this
  ADR reduces duplicated markup and wiring, not the fact that 3 hosts
  each independently call the same 3 utility functions in the same
  sequence. That sequence itself could become a small shared helper
  function (not a component) in a future round, if it's ever found to
  drift or be worth further extraction — not fixed here.

## Acceptance criteria

- [ ] `<view-image-attach>` ships in `component-view`'s `core`/`saf` with
      tests covering: trigger renders, `files-select` dispatched with the
      picked file(s)
- [ ] `<view-image-picker>` ships with tests covering: hidden when
      `dataUrl` absent, thumbnail shown when present, `error` message
      shown, `clear` dispatched on Remove click
- [ ] `review.ts` migrated to both views, `verify_web.mjs` passes with no
      assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-component-view-package.md) — package scaffold, shared Web
  Component design rationale
- ADR-0001 (workspace layout, SAF structure invariants)
