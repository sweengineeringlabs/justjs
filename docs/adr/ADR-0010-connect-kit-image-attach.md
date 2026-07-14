# ADR-0010: `@justjs/connect-kit` — reusable image-attach control component

- **Status:** Proposed
- **Date:** 2026-07-14

## Summary

Three files hand-roll the identical "attach a screenshot" flow: a file
input, a preview thumbnail, a Remove button, an error line, and real
validation/`FileReader` logic. Extract it as `<control-image-attach>`.

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

## Why this is a `control-*`, not a `view-*`

Checked the actual handler, not assumed: this owns real state
(`pendingProjectImage`), does real work (file-type/size validation,
`FileReader`-based base64 conversion via `readImageFileAsDataUrl`), and
reacts to user interaction (file picker `change`, Remove `click`) — the
same "owns state, does real behavior, not just markup" bar
`<control-provider-connect>` was held to.

## Scope

### In scope

`<control-image-attach>` (`ImageAttachControl`) — Shadow DOM, properties:
`accept` (optional MIME allow-list, defaults to the current
PNG/JPEG/WebP/GIF set), `maxBytes` (optional, defaults to the current
limit). Owns the file input, validation, `FileReader` read, preview
thumbnail, Remove button, and error display internally. Dispatches
`image-attach` (`detail: {dataUrl, mimeType, base64}`, matching
`parseDataUrl()`'s existing return shape) on a valid selection, and
`image-clear` when Remove is clicked.

### Out of scope, not guessed at

- What happens to the attached image after attachment (sending it to an
  AI review, a scaffold prompt, a chat message) — that's each host's own
  business logic, unchanged. This element only owns the attach/preview/
  clear mechanics, not what the image is used for.
- Multi-image attachment — none of the 3 existing copies support more
  than one image at a time; not invented speculatively.

## Design: real Web Component, nested rather than routed

Same reasoning as ADR-0006/ADR-0007/ADR-0008/ADR-0009: `HTMLElement`
subclass, `attachShadow({mode: "open"})`, no `x-*`/`js-*` vendor prefix,
self-registers via
`customElements.define("control-image-attach", ImageAttachControl)` as an
import side-effect, outside DDAS/boot-time validation.

## Migration strategy

1. Ship `<control-image-attach>`, verified in isolation with its own test
   suite (file-type rejection, size rejection, valid attach, clear).
2. Migrate exactly **one** existing screen as the first real consumer —
   `review.ts` (its attached image is used exactly once, for a single AI
   review call, the simplest real consumption site to verify against).
3. Migrate `chat.ts` and `scaffold.ts` opportunistically, not as a
   dedicated sweep.

## Known limitations (disclosed, not papered over)

- Only `review.ts` migrates as part of this ADR's issues — `chat.ts` and
  `scaffold.ts` keep their hand-written copies until migrated individually.
- Shadow DOM styling cost: `.attach-image-preview`/`.attach-image-label`/
  `.attach-image-error` rules in `app.css` need porting into this
  element's own `<style>` block.
- `isSupportedImageType`/`readImageFileAsDataUrl`/`parseDataUrl` (from
  `core/images.ts`) are reused as-is inside the new element rather than
  reimplemented — `connect-kit` takes a dependency on that shared
  app-local module, or those three functions get promoted into
  `connect-kit` itself. Which one is a decision for the implementing
  issue, not fixed by this ADR.

## Acceptance criteria

- [ ] `<control-image-attach>` ships in `connect-kit`'s `api`/`core`/`saf`
      with tests covering: unsupported type rejected (error shown, no
      event), oversized file rejected (error shown, no event), valid
      attach (preview shown, `image-attach` dispatched with correct
      payload), Remove clears state and dispatches `image-clear`
- [ ] `review.ts` migrated to `<control-image-attach>`, `verify_web.mjs`
      passes with no assertion count regression
- [ ] Root `bun run build`/`typecheck`/`test` clean

## Relates to

- [ADR-0006](ADR-0006-connect-kit-view.md) — package scaffold, shared Web
  Component design rationale
- [ADR-0007](ADR-0007-connect-kit-control.md) — the other `control-*`
  element in this package
- ADR-0001 (workspace layout, SAF structure invariants)
