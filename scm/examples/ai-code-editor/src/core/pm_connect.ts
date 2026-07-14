// Thin app-local adapter over the real @justjs/pm-connect package -
// same role core/socials_connect.ts/core/comms_connect.ts play for
// their own packages.
import { createPmConnectProvider, buildJiraAuthorizationUrl, exchangeJiraAuthorizationCode } from "@justjs/pm-connect";
import type { PmResource } from "@justjs/pm-connect";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import {
  setStoredJiraAppCredentials,
  setPendingJiraOAuthState,
  getPendingJiraOAuthState,
  getStoredJiraAppCredentials,
  setStoredJiraSession,
} from "./pm_credentials.js";
import type { JiraSession } from "./pm_credentials.js";

export type { PmResource };

export function connectLinear(token: string): Promise<PmResource[]> {
  return createPmConnectProvider("linear", { token }).connect();
}

export function connectAsana(token: string): Promise<PmResource[]> {
  return createPmConnectProvider("asana", { token }).connect();
}

export function connectTrello(apiKey: string, token: string): Promise<PmResource[]> {
  return createPmConnectProvider("trello", { apiKey, token }).connect();
}

export function connectJira(session: JiraSession): Promise<PmResource[]> {
  return createPmConnectProvider("jira", { accessToken: session.accessToken, cloudId: session.cloudId }).connect();
}

// Real, the one DOM-navigation side effect in this whole feature -
// persists the user's own Atlassian OAuth app credentials (never
// hardcoded/shipped in this app - the user registers their own app,
// same bring-your-own-app-credentials posture @justjs/social-connect's
// Reddit integration already established) plus a fresh CSRF state
// nonce, then redirects the real browser to Atlassian's real consent
// screen. Nothing here resolves in place - the page navigates away.
export function beginJiraConnect(clientId: string, clientSecret: string, redirectUri: string): void {
  setStoredJiraAppCredentials({ clientId, clientSecret });
  const state = crypto.randomUUID();
  setPendingJiraOAuthState(state);
  const url = buildJiraAuthorizationUrl({ clientId, redirectUri, state });
  globalThis.location.assign(url);
}

// Called once, on page load, when app.ts detects a real `code`/`state`
// pair in the URL (Atlassian's redirect back after the user approved
// consent) - validates the real CSRF state, exchanges the code for a
// real session, and persists it the same way every other provider's
// credential is persisted.
export async function completeJiraOAuthCallback(code: string, state: string, redirectUri: string): Promise<JiraSession> {
  const pendingState = getPendingJiraOAuthState();
  setPendingJiraOAuthState(null);
  if (!pendingState || pendingState !== state) {
    throw new Error("Jira: the returned state didn't match what was sent - the connect attempt may be stale or tampered with. Try connecting again.");
  }
  const appCredentials = getStoredJiraAppCredentials();
  if (!appCredentials) {
    throw new Error("Jira: no pending app credentials found for this connect attempt. Try connecting again.");
  }
  const session = await exchangeJiraAuthorizationCode(
    { clientId: appCredentials.clientId, clientSecret: appCredentials.clientSecret, code, redirectUri },
    createApiAdapter(createFetchAdapter())
  );
  const stored: JiraSession = { accessToken: session.accessToken, cloudId: session.cloudId, siteUrl: session.siteUrl };
  setStoredJiraSession(stored);
  return stored;
}
