import type { ApiAdapter } from "@justjs/transport";
import type { SocialConnectProvider, SocialResource, AppPasswordConfig } from "../api/provider.js";
import { SocialConnectProviderError } from "../api/provider.js";

interface CreateSessionResponse {
  readonly did: string;
  readonly handle: string;
  readonly accessJwt: string;
  readonly error?: string;
  readonly message?: string;
}

interface GetFollowsResponse {
  readonly follows: ReadonlyArray<{ readonly did: string; readonly handle: string; readonly displayName?: string }>;
}

// Bluesky (AT Protocol) - real distinct logic, not a
// DefaultSocialConnectProvider instance: unlike Mastodon's static
// bearer token, Bluesky's own docs confirm `com.atproto.server.
// createSession` is a real 2-field (identifier + "App Password", never
// the account password) exchange returning a short-lived `accessJwt`
// ("expires after a few minutes" per Bluesky's docs) alongside the
// account's real `did`. Nothing but the identifier/app-password is ever
// persisted (see socials_credentials.ts in the consuming app) -
// connect() re-authenticates fresh every call rather than trying to
// cache a fast-expiring token, then uses that momentary accessJwt for
// one real app.bsky.graph.getFollows call. Mirrors AWS's/Bitbucket's/
// Slack's own asymmetry precedent in @justjs/cloud-connect /
// @justjs/scm-connect / @justjs/comms-connect - a real provider quirk,
// not a design inconsistency.
export class BlueskySocialConnectProvider implements SocialConnectProvider {
  readonly concern = "socialConnect" as const;
  readonly strategy = "bluesky";

  constructor(
    private readonly config: AppPasswordConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<SocialResource[]> {
    let sessionResponse;
    try {
      sessionResponse = await this.apiAdapter.post<CreateSessionResponse>(
        "https://bsky.social/xrpc/com.atproto.server.createSession",
        { identifier: this.config.identifier, password: this.config.appPassword }
      );
    } catch {
      throw new SocialConnectProviderError(
        "NETWORK_ERROR",
        "Bluesky: network request failed - check your connection (no backend proxy, this calls bsky.social directly)."
      );
    }
    if (sessionResponse.error !== undefined || sessionResponse.data.error) {
      if (sessionResponse.status === 401 || sessionResponse.data.error === "AuthenticationRequired") {
        throw new SocialConnectProviderError(
          "TOKEN_REJECTED",
          `Bluesky: sign-in rejected (${sessionResponse.data.message ?? sessionResponse.data.error ?? sessionResponse.status}) - check the identifier and App Password.`
        );
      }
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Bluesky: sign-in failed (${sessionResponse.status} ${sessionResponse.data.error ?? sessionResponse.error}).`
      );
    }
    const { did, accessJwt } = sessionResponse.data;

    let followsResponse;
    try {
      followsResponse = await this.apiAdapter.get<GetFollowsResponse>(
        `https://bsky.social/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(did)}`,
        { headers: { Authorization: `Bearer ${accessJwt}` } }
      );
    } catch {
      throw new SocialConnectProviderError(
        "NETWORK_ERROR",
        "Bluesky: network request failed while listing follows - check your connection."
      );
    }
    if (followsResponse.error !== undefined) {
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Bluesky: request failed while listing follows (${followsResponse.status} ${followsResponse.error}).`
      );
    }
    return followsResponse.data.follows.map((f) => ({
      id: f.did,
      name: f.displayName || f.handle,
      status: f.handle,
    }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's SocialConnectProvider.weave() comment.
  }
}
