// Mirrors cloud_credentials.ts's exact storage conventions
// (justjs:ai-editor:* key prefix, localStorage-only, best-effort
// try/catch, empty string -> removeItem rather than storing "") - same
// pattern, a separate key namespace so a GitHub token never collides
// with a same-named cloud provider token. All 3 SCM providers
// (GitHub/GitLab/Bitbucket) use a single bearer token - no AWS-shaped
// credential pair needed here.

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:scm-token:${providerId}`;
}

export function getStoredScmToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredScmToken(providerId: string, token: string): void {
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
