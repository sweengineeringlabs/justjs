import { createCredentialStore } from "@justjs/provider-connect";

// A separate key namespace so a Cartoon-provider API key never collides
// with a same-named provider from any other tab. All 3 providers
// (OpenAI/Stability AI/Google Gemini) use a single bearer-shaped API
// key - the parameterized, multi-provider style this session's later
// rounds settled into, not ai_assist.ts's earlier single-provider-
// specific pattern. Storage semantics (localStorage-only, best-effort
// try/catch, empty string -> removeItem) now live once in
// @justjs/provider-connect's createCredentialStore(), replacing what
// was a 6x-duplicated shape across every *_credentials.ts file.
const cartoonCredentialStore = createCredentialStore("cartoon");

export function getStoredCartoonToken(providerId: string): string {
  return cartoonCredentialStore.get(providerId);
}

export function setStoredCartoonToken(providerId: string, token: string): void {
  cartoonCredentialStore.set(providerId, token);
}
