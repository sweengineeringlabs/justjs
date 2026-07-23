import type { ApiAdapter } from "@justjs/transport";
import { ScmConnectProviderError } from "../api/provider.js";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
// Required by GitHub's own docs when a poll comes back `slow_down`.
const SLOW_DOWN_EXTRA_SECONDS = 5;
const DEFAULT_SCOPE = "repo";

export interface GithubDeviceCodeConfig {
  readonly clientId: string;
  readonly scope?: string;
  // Overrides the real github.com device-code endpoint - points at a local
  // CORS relay (scm/bo) instead, since GitHub's device-flow endpoints send
  // no CORS headers and cannot be called directly from a browser (confirmed
  // by live testing against real, valid client ids - justjs#135). Defaults
  // to the real GitHub endpoint.
  readonly deviceCodeUrl?: string;
}

export interface GithubDeviceCodeSession {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly expiresIn: number;
  readonly interval: number;
}

interface GithubDeviceCodeResponseBody {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly expires_in: number;
  readonly interval: number;
}

interface GithubAccessTokenSuccessBody {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
}

interface GithubAccessTokenErrorBody {
  readonly error: string;
  readonly error_description?: string;
}

type GithubAccessTokenResponseBody = GithubAccessTokenSuccessBody | GithubAccessTokenErrorBody;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSuccessBody(body: GithubAccessTokenResponseBody): body is GithubAccessTokenSuccessBody {
  return "access_token" in body;
}

// Real GitHub Device Authorization Flow (confirmed against GitHub's own
// docs, docs.github.com/en/apps/oauth-apps/building-oauth-apps/
// authorizing-oauth-apps) - no redirect URI anywhere in this flow, which
// is exactly why it's used instead of the standard authorization-
// code+redirect flow: a packaged Android WebView has no HTTP origin for
// a redirect to land on (the same structural gap already documented for
// Jira's OAuth in ai-code-editor's README.md). Pure, DOM-free, injected
// ApiAdapter - same convention every other provider in this package uses.
export async function requestGithubDeviceCode(
  config: GithubDeviceCodeConfig,
  apiAdapter: ApiAdapter
): Promise<GithubDeviceCodeSession> {
  let response;
  try {
    response = await apiAdapter.post<GithubDeviceCodeResponseBody>(
      config.deviceCodeUrl ?? DEVICE_CODE_URL,
      { client_id: config.clientId, scope: config.scope ?? DEFAULT_SCOPE },
      { headers: { Accept: "application/json" } }
    );
  } catch {
    throw new ScmConnectProviderError("NETWORK_ERROR", "GitHub: network request failed while requesting a device code.");
  }
  if (response.error !== undefined) {
    throw new ScmConnectProviderError(
      "REQUEST_FAILED",
      `GitHub: requesting a device code failed (${response.status} ${response.error}).`
    );
  }
  const body = response.data;
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    expiresIn: body.expires_in,
    interval: body.interval,
  };
}

// Polls until the user finishes signing in on GitHub's own site, the
// device code expires, or they deny access - bounded by GitHub's own
// expiresIn (never an unbounded loop). GitHub returns HTTP 200 even for
// a pending/failed poll (confirmed against its docs) - the outcome
// lives in the JSON body's `error` field, never the HTTP status, so
// this branches on the body shape, not `response.error`.
//
// `signal`, if given, is checked before each sleep and each request -
// this stops scheduling further polls once aborted, but (a disclosed
// limitation, matching this codebase's honesty bar elsewhere) cannot
// cancel a request already in flight when abort fires, since
// @justjs/transport's ApiAdapter has no cancellation passthrough; that
// in-flight response is simply never awaited.
//
// `sleepFn` is injectable so tests can drive the loop without real
// wall-clock delays - defaults to a real setTimeout-based sleep.
//
// `accessTokenUrl` overrides the real github.com token endpoint, same
// reasoning as GithubDeviceCodeConfig.deviceCodeUrl above - defaults to the
// real GitHub endpoint.
export async function pollGithubDeviceToken(
  clientId: string,
  session: GithubDeviceCodeSession,
  apiAdapter: ApiAdapter,
  signal?: AbortSignal,
  sleepFn: (ms: number) => Promise<void> = sleep,
  accessTokenUrl: string = ACCESS_TOKEN_URL
): Promise<string> {
  const deadline = Date.now() + session.expiresIn * 1000;
  let intervalMs = session.interval * 1000;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new ScmConnectProviderError("DEVICE_FLOW_ABORTED", "GitHub: sign-in was cancelled.");
    }
    await sleepFn(intervalMs);
    if (signal?.aborted) {
      throw new ScmConnectProviderError("DEVICE_FLOW_ABORTED", "GitHub: sign-in was cancelled.");
    }
    let response;
    try {
      response = await apiAdapter.post<GithubAccessTokenResponseBody>(
        accessTokenUrl,
        { client_id: clientId, device_code: session.deviceCode, grant_type: DEVICE_GRANT_TYPE },
        { headers: { Accept: "application/json" } }
      );
    } catch {
      throw new ScmConnectProviderError(
        "NETWORK_ERROR",
        "GitHub: network request failed while checking whether you've finished signing in."
      );
    }
    if (response.error !== undefined) {
      throw new ScmConnectProviderError(
        "REQUEST_FAILED",
        `GitHub: checking sign-in status failed (${response.status} ${response.error}).`
      );
    }
    const body = response.data;
    if (isSuccessBody(body)) {
      return body.access_token;
    }
    switch (body.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        intervalMs += SLOW_DOWN_EXTRA_SECONDS * 1000;
        continue;
      case "expired_token":
        throw new ScmConnectProviderError(
          "DEVICE_FLOW_EXPIRED",
          "GitHub: the device code expired before you finished signing in - try connecting again."
        );
      case "access_denied":
        throw new ScmConnectProviderError("DEVICE_FLOW_DENIED", "GitHub: sign-in was cancelled or denied.");
      default:
        // unsupported_grant_type/incorrect_client_credentials/
        // incorrect_device_code/device_flow_disabled, or anything GitHub
        // adds later - a real, surfaced failure either way, never
        // silently retried as if it were transient.
        throw new ScmConnectProviderError(
          "REQUEST_FAILED",
          `GitHub: sign-in failed (${body.error}${body.error_description ? `: ${body.error_description}` : ""}).`
        );
    }
  }
  throw new ScmConnectProviderError(
    "DEVICE_FLOW_EXPIRED",
    "GitHub: the device code expired before you finished signing in - try connecting again."
  );
}
