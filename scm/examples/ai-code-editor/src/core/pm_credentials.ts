// Mirrors socials_credentials.ts's exact storage conventions
// (justjs:ai-editor:* key prefix, localStorage-only, best-effort
// try/catch, empty string -> removeItem rather than storing "") - same
// pattern, a separate key namespace so a PM-provider credential never
// collides with a same-named cloud/SCM/comms/social provider token.
// Linear/Asana use a single bearer token; Trello needs 2 real fields
// (API key + token); Jira needs 2 real credential shapes - the user's
// own OAuth app {clientId, clientSecret} (used only to *initiate* a
// connect) and the resulting {accessToken, cloudId, siteUrl} session
// once the real redirect/exchange completes.

export interface TrelloCredentials {
  readonly apiKey: string;
  readonly token: string;
}

export interface JiraAppCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface JiraSession {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly siteUrl: string;
}

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:pm-token:${providerId}`;
}

const TRELLO_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:trello-credentials";
const JIRA_APP_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:jira-app-credentials";
const JIRA_SESSION_STORAGE_KEY = "justjs:ai-editor:jira-session";
// A short-lived CSRF nonce set immediately before redirecting to
// Atlassian's consent screen, checked against the real `state` query
// param on return - sessionStorage, not localStorage, since this only
// ever needs to survive one real round-trip within the same tab (and
// sessionStorage surviving a full page navigation, unlike an in-memory
// variable, is exactly why this works at all).
const JIRA_PENDING_OAUTH_STATE_KEY = "justjs:ai-editor:jira-pending-oauth-state";

export function getStoredPmToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredPmToken(providerId: string, token: string): void {
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

export function getStoredTrelloCredentials(): TrelloCredentials | null {
  try {
    const raw = globalThis.localStorage?.getItem(TRELLO_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<TrelloCredentials>;
    if (!parsed.apiKey || !parsed.token) {
      return null;
    }
    return { apiKey: parsed.apiKey, token: parsed.token };
  } catch {
    return null;
  }
}

export function setStoredTrelloCredentials(credentials: TrelloCredentials | null): void {
  try {
    if (credentials && credentials.apiKey && credentials.token) {
      globalThis.localStorage?.setItem(TRELLO_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    } else {
      globalThis.localStorage?.removeItem(TRELLO_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getStoredJiraAppCredentials(): JiraAppCredentials | null {
  try {
    const raw = globalThis.localStorage?.getItem(JIRA_APP_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<JiraAppCredentials>;
    if (!parsed.clientId || !parsed.clientSecret) {
      return null;
    }
    return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
  } catch {
    return null;
  }
}

export function setStoredJiraAppCredentials(credentials: JiraAppCredentials | null): void {
  try {
    if (credentials && credentials.clientId && credentials.clientSecret) {
      globalThis.localStorage?.setItem(JIRA_APP_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    } else {
      globalThis.localStorage?.removeItem(JIRA_APP_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getStoredJiraSession(): JiraSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(JIRA_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<JiraSession>;
    if (!parsed.accessToken || !parsed.cloudId) {
      return null;
    }
    return { accessToken: parsed.accessToken, cloudId: parsed.cloudId, siteUrl: parsed.siteUrl ?? "" };
  } catch {
    return null;
  }
}

export function setStoredJiraSession(session: JiraSession | null): void {
  try {
    if (session && session.accessToken && session.cloudId) {
      globalThis.localStorage?.setItem(JIRA_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      globalThis.localStorage?.removeItem(JIRA_SESSION_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getPendingJiraOAuthState(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(JIRA_PENDING_OAUTH_STATE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setPendingJiraOAuthState(state: string | null): void {
  try {
    if (state) {
      globalThis.sessionStorage?.setItem(JIRA_PENDING_OAUTH_STATE_KEY, state);
    } else {
      globalThis.sessionStorage?.removeItem(JIRA_PENDING_OAUTH_STATE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}
