import type { AspectTarget } from "@justjs/application";

// A real generated image's raw bytes, base64-encoded - never a URL
// (OpenAI's own images API stopped honoring `response_format` and
// always returns base64 now; Stability/Gemini both return base64
// inline too, confirmed live/via docs) - so every provider in this
// package returns the exact same real shape regardless of how each
// one's own API happens to answer.
export interface GeneratedImage {
  readonly base64: string;
  readonly mimeType: string;
}

// All 3 real providers (OpenAI/Stability AI/Google Gemini) use a
// single bearer-shaped API key - the auth header/param convention
// varies per provider (see each core/ class) but the credential itself
// is always one string.
export interface BearerTokenConfig {
  readonly token: string;
}

export interface ImageConnectProvider {
  readonly concern: "imageConnect";
  readonly strategy: string;
  // Proves the key actually works via a real, free (non-billed)
  // endpoint - never a real generation call, which costs real money.
  // Returns a real, human-readable status label (Stability's own real
  // credit balance; OpenAI's/Gemini's plain "API key verified", since
  // neither has a real balance-check endpoint at this bearer-token
  // level).
  connect(): Promise<string>;
  // A real, billed image-generation call - always styled as a cartoon
  // via that provider's own real mechanism (Stability: a real,
  // literal `style_preset` field; OpenAI/Gemini: real prompt
  // engineering, since neither has a structured style parameter -
  // disclosed as such by the caller, not fabricated as equivalent).
  generate(prompt: string): Promise<GeneratedImage>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - imageConnect isn't
  // a rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as every other *-connect
  // package's weave().
  weave(target: AspectTarget): void;
}

export class ImageConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ImageConnectProviderError";
  }
}
