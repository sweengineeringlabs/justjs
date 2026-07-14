// Mirrors comms_credentials.ts's exact storage conventions
// (justjs:ai-editor:* key prefix, localStorage-only, best-effort
// try/catch, empty string -> removeItem rather than storing "") - same
// pattern, a separate key namespace so a social-provider credential
// never collides with a same-named cloud/SCM/comms provider token.
// Mastodon uses a single bearer token (same tokenStorageKey() shape as
// every other single-token provider); Bluesky/Reddit each need 2 real
// fields, stored as one JSON blob per provider - same shape
// cloud_credentials.ts's AwsCredentials already established for AWS.

export interface BlueskyCredentials {
  readonly identifier: string;
  readonly appPassword: string;
}

export interface RedditCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:social-token:${providerId}`;
}

const BLUESKY_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:bluesky-credentials";
const REDDIT_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:reddit-credentials";

export function getStoredSocialToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredSocialToken(providerId: string, token: string): void {
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

export function getStoredBlueskyCredentials(): BlueskyCredentials | null {
  try {
    const raw = globalThis.localStorage?.getItem(BLUESKY_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<BlueskyCredentials>;
    if (!parsed.identifier || !parsed.appPassword) {
      return null;
    }
    return { identifier: parsed.identifier, appPassword: parsed.appPassword };
  } catch {
    return null;
  }
}

export function setStoredBlueskyCredentials(credentials: BlueskyCredentials | null): void {
  try {
    if (credentials && credentials.identifier && credentials.appPassword) {
      globalThis.localStorage?.setItem(BLUESKY_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    } else {
      globalThis.localStorage?.removeItem(BLUESKY_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getStoredRedditCredentials(): RedditCredentials | null {
  try {
    const raw = globalThis.localStorage?.getItem(REDDIT_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RedditCredentials>;
    if (!parsed.clientId || !parsed.clientSecret) {
      return null;
    }
    return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
  } catch {
    return null;
  }
}

export function setStoredRedditCredentials(credentials: RedditCredentials | null): void {
  try {
    if (credentials && credentials.clientId && credentials.clientSecret) {
      globalThis.localStorage?.setItem(REDDIT_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    } else {
      globalThis.localStorage?.removeItem(REDDIT_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}
