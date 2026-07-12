import type { ImageAttachment } from "@justjs/ai-assist";

// Browser-side image mechanics for this app's real vision-AI attach
// flow (Chat, Review, Scaffold -> New Project) - the `ImageAttachment`
// *type* itself lives in @justjs/ai-assist (the API contract), imported
// here rather than redefined, same precedent core/state.ts already
// established for ReviewFinding.
export type { ImageAttachment };

// Anthropic's real per-image limit is ~5MB *after* base64 encoding,
// which inflates size by roughly 4/3 - staying at 4MB raw keeps every
// attached image comfortably under that (5MB / (4/3) ~= 3.75MB raw).
// Enforced at file-picker `change` time, before FileReader ever runs -
// no wasted read on a file that's going to be rejected anyway, and a
// real, specific inline error instead of a confusing 400 from Anthropic
// seconds later after a network round trip. MAX_IMAGE_MB is a separate,
// named constant (not computed via division at display sites) purely so
// error messages never need `x / (1024 * 1024)` - a parenthesized-
// operand-of-a-binary-operator shape justc (0.3.5, hardware-confirmed
// elsewhere in this codebase) has a real bug silently mangling.
export const MAX_IMAGE_MB = 4;
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;

const SUPPORTED_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function isSupportedImageType(mediaType: string): boolean {
  return SUPPORTED_MEDIA_TYPES.has(mediaType);
}

// Reused verbatim from agentic-memory-demo/src/core/images.ts - that
// app never sends the result anywhere, only stores/displays it; this app
// additionally parses the result into an ImageAttachment via
// parseDataUrl() below to actually send it to Anthropic.
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

// Splits a "data:image/png;base64,AAAA..." data URL into the
// {mediaType, base64Data} shape Anthropic's Messages API needs (no
// "data:...;base64," prefix). Returns null for a malformed data URL or
// an unsupported media type - the file.type/size checks at the file
// picker already catch the common case before this ever runs; this is a
// defensive fallback for the actual encoded data, not a duplicate of
// that check.
export function parseDataUrl(dataUrl: string): ImageAttachment | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    return null;
  }
  const mediaType = match[1]!;
  const base64Data = match[2]!;
  if (!isSupportedImageType(mediaType)) {
    return null;
  }
  return { mediaType: mediaType as ImageAttachment["mediaType"], base64Data };
}
