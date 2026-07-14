// Mirrors scm_credentials.ts's exact storage conventions
// (justjs:ai-editor:* key prefix, localStorage-only, best-effort
// try/catch, empty string -> removeItem rather than storing "") - same
// pattern, a separate key namespace so a Slack token never collides
// with a same-named cloud/SCM provider token. All 3 communication
// providers (Slack/Discord/Microsoft Teams) use a single bearer-shaped
// token - no signing/two-field credential needed here.

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:comms-token:${providerId}`;
}

export function getStoredCommsToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredCommsToken(providerId: string, token: string): void {
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
