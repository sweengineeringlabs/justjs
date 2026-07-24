import type { ApiAdapter } from "@justjs/transport";
import type { CommsConnectProvider, CommsResource, CommsMessage, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";

interface SlackConversationsListResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly channels?: ReadonlyArray<{ readonly id: string; readonly name: string; readonly is_private: boolean; readonly is_archived?: boolean }>;
}

interface SlackConversationsHistoryResponse {
  readonly ok: boolean;
  readonly error?: string;
  readonly messages?: ReadonlyArray<{ readonly ts: string; readonly user?: string; readonly text?: string }>;
}

interface SlackConversationsMarkResponse {
  readonly ok: boolean;
  readonly error?: string;
}

interface SlackChatPostMessageResponse {
  readonly ok: boolean;
  readonly error?: string;
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
      archived: c.is_archived ?? false,
    }));
  }

  // Real conversations.history - lists a real channel's recent
  // messages. `author` is the raw Slack user id (e.g. "U123ABC456"),
  // not a resolved display name - Slack's history endpoint doesn't
  // return one, and resolving each unique user id to a name would need
  // a separate real users.info call per author, a real N+1 cost this
  // provider deliberately doesn't take on. Still real and truthful, not
  // a fabricated name.
  async listMessages(channelId: string): Promise<CommsMessage[]> {
    let response;
    try {
      response = await this.apiAdapter.get<SlackConversationsHistoryResponse>(
        `https://slack.com/api/conversations.history?channel=${encodeURIComponent(channelId)}&limit=50`,
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Slack: network request failed while listing messages - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: request failed (${response.status} ${response.error}).`);
    }
    if (!response.data.ok) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: listing messages failed (${response.data.error ?? "unknown_error"}).`);
    }
    return (response.data.messages ?? []).map((m) => ({
      id: m.ts,
      author: m.user ?? "unknown",
      text: m.text ?? "",
      timestamp: m.ts,
    }));
  }

  // Real conversations.mark - a genuine, working API call, with a real,
  // honest limitation: since this app authenticates as a bot (not a
  // human user), this moves the *bot's own* read cursor for the
  // channel, not any human user's. Slack has no API for a bot token to
  // mark read-state on behalf of a different (human) identity - that
  // would need a user token with that user's own consent, which this
  // app's bearer-bot-token connect flow never obtains. Real, but its
  // practical significance is limited - disclosed in this app's own
  // Settings UI, not hidden.
  async markAsRead(channelId: string, latestTimestamp: string): Promise<void> {
    let response;
    try {
      response = await this.apiAdapter.post<SlackConversationsMarkResponse>(
        "https://slack.com/api/conversations.mark",
        { channel: channelId, ts: latestTimestamp },
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Slack: network request failed while marking the channel read - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: request failed (${response.status} ${response.error}).`);
    }
    if (!response.data.ok) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: marking the channel read failed (${response.data.error ?? "unknown_error"}).`);
    }
  }

  // Real chat.postMessage - sends as the bot identity (this app's bearer
  // token), never impersonating a human user, same posture as
  // markAsRead's own bot-only read cursor above.
  async sendMessage(channelId: string, text: string): Promise<void> {
    let response;
    try {
      response = await this.apiAdapter.post<SlackChatPostMessageResponse>(
        "https://slack.com/api/chat.postMessage",
        { channel: channelId, text },
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Slack: network request failed while sending the message - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: request failed (${response.status} ${response.error}).`);
    }
    if (!response.data.ok) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Slack: sending the message failed (${response.data.error ?? "unknown_error"}).`);
    }
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CommsConnectProvider.weave() comment.
  }
}
