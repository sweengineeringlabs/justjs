import type { ApiAdapter } from "@justjs/transport";
import { PmConnectProviderError } from "../api/provider.js";

const DEFAULT_SCOPES = ["read:jira-work"];

export interface JiraAuthorizationUrlConfig {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly scopes?: readonly string[];
}

// Pure - builds the real Atlassian OAuth 2.0 (3LO) authorization URL
// (confirmed via Atlassian's own docs: audience/client_id/scope/
// redirect_uri/state/response_type/prompt are all required/recommended
// params). Does NOT navigate anywhere itself - the caller (this app's
// core/pm_connect.ts) does the real `window.location.assign(url)`, so
// this package stays DOM-free and this function stays trivially
// unit-testable.
export function buildJiraAuthorizationUrl(config: JiraAuthorizationUrlConfig): string {
  const params = new URLSearchParams({
    audience: "api.atlassian.com",
    client_id: config.clientId,
    scope: (config.scopes ?? DEFAULT_SCOPES).join(" "),
    redirect_uri: config.redirectUri,
    state: config.state,
    response_type: "code",
    prompt: "consent",
  });
  return `https://auth.atlassian.com/authorize?${params.toString()}`;
}

export interface JiraAuthorizationCodeExchangeConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly redirectUri: string;
}

export interface JiraOAuthSession {
  readonly accessToken: string;
  readonly cloudId: string;
  readonly siteUrl: string;
}

interface JiraTokenResponse {
  readonly access_token: string;
}

interface JiraAccessibleResource {
  readonly id: string;
  readonly url: string;
}

// Real 2-call OAuth completion: exchange the authorization code for a
// real access token (Atlassian's own docs: this requires a real
// client_secret - there is no PKCE alternative for public clients,
// confirmed via research - so this is only as safe as the user's own
// OAuth app credentials, exactly the same posture @justjs/social-connect's
// Reddit integration already established), then discover the real Jira
// Cloud site (`cloudId`) that session can actually reach. Uses the
// *first* accessible resource - a real, disclosed limitation (same
// first-workspace/first-site precedent Asana's/Bitbucket's own
// providers already use in this package/its siblings), not silently
// presented as "every site you belong to."
export async function exchangeJiraAuthorizationCode(
  config: JiraAuthorizationCodeExchangeConfig,
  apiAdapter: ApiAdapter
): Promise<JiraOAuthSession> {
  let tokenResponse;
  try {
    tokenResponse = await apiAdapter.post<JiraTokenResponse>("https://auth.atlassian.com/oauth/token", {
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: config.code,
      redirect_uri: config.redirectUri,
    });
  } catch {
    throw new PmConnectProviderError("NETWORK_ERROR", "Jira: network request failed while exchanging the authorization code.");
  }
  if (tokenResponse.error !== undefined) {
    throw new PmConnectProviderError(
      "TOKEN_EXCHANGE_FAILED",
      `Jira: exchanging the authorization code failed (${tokenResponse.status} ${tokenResponse.error}) - check the Client ID/Secret and that the redirect URI matches exactly what's registered in your Atlassian app.`
    );
  }
  const accessToken = tokenResponse.data.access_token;

  let resourcesResponse;
  try {
    resourcesResponse = await apiAdapter.get<JiraAccessibleResource[]>("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new PmConnectProviderError("NETWORK_ERROR", "Jira: network request failed while discovering your accessible sites.");
  }
  if (resourcesResponse.error !== undefined) {
    throw new PmConnectProviderError(
      "REQUEST_FAILED",
      `Jira: discovering your accessible sites failed (${resourcesResponse.status} ${resourcesResponse.error}).`
    );
  }
  const [firstSite] = resourcesResponse.data;
  if (!firstSite) {
    throw new PmConnectProviderError("NO_ACCESSIBLE_SITE", "Jira: this account has no accessible Jira Cloud site - grant the app access to at least one site.");
  }
  return { accessToken, cloudId: firstSite.id, siteUrl: firstSite.url };
}
