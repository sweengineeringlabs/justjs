// Mirrors pm_credentials.ts's/socials_credentials.ts's exact storage
// conventions (justjs:ai-editor:* key prefix, localStorage-only,
// best-effort try/catch, empty string -> removeItem rather than
// storing "") - a separate key namespace so a Cartoon-provider API key
// never collides with a same-named provider from any other tab. All 3
// providers (OpenAI/Stability AI/Google Gemini) use a single bearer-
// shaped API key - the parameterized, multi-provider style this
// session's later rounds settled into, not ai_assist.ts's earlier
// single-provider-specific pattern.

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:cartoon-token:${providerId}`;
}

export function getStoredCartoonToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredCartoonToken(providerId: string, token: string): void {
  try {
    if (token) {
      globalThis.localStorage?.setItem(tokenStorageKey(providerId), token);
    } else {
      globalThis.localStorage?.removeItem(tokenStorageKey(providerId));
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}
