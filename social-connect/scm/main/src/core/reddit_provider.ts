import type { ApiAdapter } from "@justjs/transport";
import type { SocialConnectProvider, SocialResource, ClientCredentialsConfig } from "../api/provider.js";
import { SocialConnectProviderError } from "../api/provider.js";

interface AccessTokenResponse {
  readonly access_token: string;
}

interface PopularListingResponse {
  readonly data: {
    readonly children: ReadonlyArray<{
      readonly data: { readonly id: string; readonly title: string; readonly subreddit_name_prefixed: string };
    }>;
  };
}

// Reddit - real distinct logic, not a DefaultSocialConnectProvider
// instance: Reddit's own OAuth2 `client_credentials` grant (confirmed
// live: HTTP Basic `clientId:clientSecret` + `grant_type=
// client_credentials` against /api/v1/access_token, a real
// {"message":"Unauthorized","error":401} for bad creds) issues an
// APP-LEVEL-ONLY token - it cannot list a specific user's own saved/
// subscribed content, only public data. connect() proves the
// credentials work against a real public listing
// (r/popular/hot) rather than presenting this as "your Reddit
// account" - real user-scoped access needs the full OAuth
// authorization-code consent flow, out of scope here, same as
// Bitbucket's "first workspace only" disclosed-limitation precedent in
// @justjs/scm-connect. Also real: Reddit's CORS
// Access-Control-Allow-Headers does not include User-Agent, and
// browsers block scripts from overriding it regardless (a Fetch-spec
// forbidden header) - no custom User-Agent is sent here; the browser's
// own default goes out instead, a known, accepted limitation confirmed
// not to block the token exchange itself.
export class RedditSocialConnectProvider implements SocialConnectProvider {
  readonly concern = "socialConnect" as const;
  readonly strategy = "reddit";

  constructor(
    private readonly config: ClientCredentialsConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<SocialResource[]> {
    let tokenResponse;
    try {
      tokenResponse = await this.apiAdapter.post<AccessTokenResponse>(
        "https://www.reddit.com/api/v1/access_token",
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${btoa(`${this.config.clientId}:${this.config.clientSecret}`)}`,
            "content-type": "application/x-www-form-urlencoded",
          },
        }
      );
    } catch {
      throw new SocialConnectProviderError(
        "NETWORK_ERROR",
        "Reddit: network request failed - check your connection (no backend proxy, this calls reddit.com directly)."
      );
    }
    if (tokenResponse.error !== undefined) {
      if (tokenResponse.status === 401 || tokenResponse.status === 403) {
        throw new SocialConnectProviderError(
          "TOKEN_REJECTED",
          `Reddit: client ID/secret rejected (${tokenResponse.status}) - check both values.`
        );
      }
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Reddit: token request failed (${tokenResponse.status} ${tokenResponse.error}).`
      );
    }

    let listingResponse;
    try {
      listingResponse = await this.apiAdapter.get<PopularListingResponse>(
        "https://oauth.reddit.com/r/popular/hot?limit=10",
        { headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } }
      );
    } catch {
      throw new SocialConnectProviderError(
        "NETWORK_ERROR",
        "Reddit: network request failed while listing r/popular - check your connection."
      );
    }
    if (listingResponse.error !== undefined) {
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Reddit: request failed while listing r/popular (${listingResponse.status} ${listingResponse.error}).`
      );
    }
    return listingResponse.data.data.children.map((c) => ({
      id: c.data.id,
      name: c.data.title,
      status: c.data.subreddit_name_prefixed,
    }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's SocialConnectProvider.weave() comment.
  }
}
