import { createCredentialStore } from "@justjs/provider-connect";

// Mastodon is the only single bearer-token provider among Socials' 3
// real providers - its storage now goes through createCredentialStore()
// (@justjs/provider-connect), same as cartoon_credentials.ts. Its real
// key shape (justjs:ai-editor:social-token:<providerId>) is unchanged -
// createCredentialStore("social") produces the exact same prefix the
// old hand-rolled tokenStorageKey() did, so already-stored tokens stay
// valid across this migration.
//
// Bluesky and Reddit each need 2 real fields stored as one JSON blob
// per provider - a different shape createCredentialStore()'s
// single-string get/set API doesn't cover, so they keep their own
// dedicated localStorage logic below (a real, disclosed limitation,
// not overlooked - same shape cloud_credentials.ts's AwsCredentials
// already established for AWS).

export interface BlueskyCredentials {
  readonly identifier: string;
  readonly appPassword: string;
}

export interface RedditCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

const socialCredentialStore = createCredentialStore("social");

const BLUESKY_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:bluesky-credentials";
const REDDIT_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:reddit-credentials";

export function getStoredSocialToken(providerId: string): string {
  return socialCredentialStore.get(providerId);
}

export function setStoredSocialToken(providerId: string, token: string): void {
  socialCredentialStore.set(providerId, token);
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
