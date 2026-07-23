// Thin app-local adapter over @justjs/scm-connect's GitHub Device Flow
// functions - same role core/pm_connect.ts plays for Jira's OAuth
// redirect flow, but this flow never navigates the browser at all (no
// redirect URI exists in device flow, which is the whole reason it's
// used here - a packaged Android WebView has no HTTP origin for a
// redirect to land on, see README.md's Jira section for the problem
// this sidesteps). The poll loop itself lives entirely in
// @justjs/scm-connect (core/github_device_flow.ts) - this module only
// supplies the one real, app-specific piece: the OAuth App Client ID.
import { requestGithubDeviceCode, pollGithubDeviceToken } from "@justjs/scm-connect";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";

// Register a real GitHub OAuth App at github.com/settings/developers,
// enable "Device Flow" in that app's settings, and paste its real
// Client ID here. Device Flow client ids are not secret - GitHub's
// device-token-exchange endpoint never accepts or needs a client_secret
// for this grant type - unlike Jira's/Reddit's bring-your-own-app-
// credentials screens elsewhere in this app (which do need a secret, so
// those can't be a shipped constant), a single app-wide value is safe
// to hardcode here once registered.
export const GITHUB_OAUTH_CLIENT_ID = "REPLACE_WITH_REAL_GITHUB_OAUTH_APP_CLIENT_ID";

// GitHub's device-flow endpoints (github.com/login/device/code,
// github.com/login/oauth/access_token) send no CORS headers - confirmed by
// live testing against real, valid client ids, not assumed - so a browser
// can never call them directly. scm/bo (a tiny local relay, see its own
// README/Cargo.toml) forwards these two calls and adds the CORS headers a
// browser needs; it never sees a token or a client_id secret (there is no
// secret in this grant type). Hardcoded to the local dev relay's default
// bind address for now - a real deployed relay URL is a follow-up decision,
// not solved here.
const RELAY_BASE_URL = "http://127.0.0.1:8787";

const apiAdapter = createApiAdapter(createFetchAdapter());

export interface GithubDeviceFlowHandle {
  readonly userCode: string;
  readonly verificationUri: string;
  readonly token: Promise<string>;
}

// Awaits only the device-code request (fast - one round trip) so the
// caller can show the real user code/URL immediately; the token poll
// itself keeps running in the background as the returned `token`
// promise, exactly the shape ProviderConnectorControl's
// DeviceFlowBeginFunction expects.
export async function beginGithubDeviceFlow(signal?: AbortSignal): Promise<GithubDeviceFlowHandle> {
  const session = await requestGithubDeviceCode(
    { clientId: GITHUB_OAUTH_CLIENT_ID, scope: "repo", deviceCodeUrl: `${RELAY_BASE_URL}/github/device/code` },
    apiAdapter
  );
  return {
    userCode: session.userCode,
    verificationUri: session.verificationUri,
    token: pollGithubDeviceToken(
      GITHUB_OAUTH_CLIENT_ID,
      session,
      apiAdapter,
      signal,
      undefined,
      `${RELAY_BASE_URL}/github/device/token`
    ),
  };
}
