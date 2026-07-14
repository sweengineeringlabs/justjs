import type { ApiAdapter } from "@justjs/transport";
import type { CommsConnectProvider, CommsResource, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";

interface SlackConversationsListResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly channels?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly is_private: boolean }>;
}

// Slack - real distinct logic, not a DefaultCommsConnectProvider
// instance: Slack's API always returns HTTP 200, even on auth failure -
// confirmed live (a fake token returns 200 with body
// {"ok":false,"error":"invalid_auth"}). A naive HTTP-status check
// (DefaultCommsConnectProvider's approach) would treat this as success.
// connect() always inspects the real `ok` field instead. Mirrors AWS's/
// Bitbucket's/GetCallerIdentity's own asymmetry precedent in
// @justjs/cloud-connect / @justjs/scm-connect - a real provider quirk,
// not a design inconsistency.
export class SlackCommsConnectProvider implements CommsConnectProvider {
  readonly concern = "commsConnect" as const;
  readonly strategy = "slack";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<CommsResource[]> {
    let response;
    try {
      response = await this.apiAdapter.get<SlackConversationsListResponse>(
        "https://slack.com/api/conversations.list",
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Slack: network request failed - check your connection (no backend proxy, this calls slack.com directly)."
      );
    }
    // Slack's own transport-level error (rare - it normally answers
    // with a real 200 + ok:false instead, checked below).
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: request failed (${response.status} ${response.error}).`);
    }
    if (!response.data.ok) {
      const reason = response.data.error ?? "unknown_error";
      if (reason === "invalid_auth" || reason === "not_authed" || reason === "token_revoked" || reason === "account_inactive") {
        throw new CommsConnectProviderError("TOKEN_REJECTED", `Slack: token rejected (${reason}) - it may be invalid, expired, or revoked.`);
      }
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: request failed (${reason}).`);
    }
    return (response.data.channels ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.is_private ? "private" : "public",
    }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CommsConnectProvider.weave() comment.
  }
}
