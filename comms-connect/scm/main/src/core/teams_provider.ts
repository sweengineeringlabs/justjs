import type { ApiAdapter } from "@justjs/transport";
import type { CommsConnectProvider, CommsResource, CommsMessage, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";
import { DefaultCommsConnectProvider } from "./default_comms_connect_provider.js";
import type { CommsProviderDescriptor } from "./default_comms_connect_provider.js";

// Token comes from `az account get-access-token --resource-type
// ms-graph --query accessToken -o tsv` (a real, documented Azure CLI
// command) - same short-lived-CLI-token pattern @justjs/cloud-connect's
// Azure provider already uses.
const TEAMS_JOINED_TEAMS_DESCRIPTOR: CommsProviderDescriptor = {
  strategy: "teams",
  name: "Microsoft Teams",
  url: "https://graph.microsoft.com/v1.0/me/joinedTeams",
  parse: (data) =>
    (data as { value: Array<{ id: string; displayName: string; visibility?: string }> }).value.map((t) => ({
      id: t.id,
      name: t.displayName,
      status: t.visibility ?? "unknown",
    })),
};

interface TeamsChannelsResponse {
  readonly value: ReadonlyArray<{ readonly id: string; readonly displayName: string; readonly isArchived?: boolean }>;
}

interface TeamsMessagesResponse {
  readonly value: ReadonlyArray<{
    readonly id: string;
    readonly createdDateTime: string;
    readonly from?: { readonly user?: { readonly displayName?: string } };
    readonly body: { readonly content: string };
  }>;
}

// A real, safe HTML-to-text conversion - Teams' own message body is
// real HTML (confirmed via Microsoft's own docs), and this app must
// never let a remote channel message's raw HTML reach the DOM
// unsanitized (a real XSS vector, not a theoretical one). DOMParser
// here only ever produces a detached document (never inserted into the
// live page) and only `.textContent` - never `.innerHTML` - is read
// back out, so nothing here can execute. `.textContent` alone isn't
// enough, though - a real, confirmed gotcha caught by this package's
// own test suite: `.textContent` includes a `<script>` element's own
// text (the literal source code), it just doesn't execute it - so
// `<script>`/`<style>` elements are explicitly removed first, not just
// left for `.textContent` to "not include" them.
function stripHtmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style").forEach((el) => el.remove());
  return (doc.body.textContent ?? "").trim();
}

// Microsoft Teams - real distinct logic, not a plain
// DefaultCommsConnectProvider instance: connect() keeps that same
// generic engine's real "list joined teams" behavior (unchanged), but
// a team is one real level shallower than a channel - listChannels()/
// listMessages() add the 2 real Graph calls needed to reach an actual
// message thread. Deliberately no markAsRead() - Teams has no real
// read-state capability reachable via either application permissions or
// this app's CLI-delegated token pattern (confirmed via Microsoft's own
// docs: the only read-state Graph APIs are for 1:1/group chats under
// delegated auth with Chat.ReadWrite, explicitly unsupported for
// channel messages or app-only auth).
export class TeamsCommsConnectProvider implements CommsConnectProvider {
  readonly concern = "commsConnect" as const;
  readonly strategy = "teams";
  private readonly teamsEngine: DefaultCommsConnectProvider;

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.teamsEngine = new DefaultCommsConnectProvider(TEAMS_JOINED_TEAMS_DESCRIPTOR, config, this.apiAdapter);
  }

  connect(): Promise<CommsResource[]> {
    return this.teamsEngine.connect();
  }

  async listChannels(teamId: string): Promise<CommsResource[]> {
    let response;
    try {
      response = await this.apiAdapter.get<TeamsChannelsResponse>(`https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(teamId)}/channels`, {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Microsoft Teams: network request failed while listing channels - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toChannelOrMessageError(response.status, response.error, "listing channels");
    }
    return response.data.value.map((c) => ({ id: c.id, name: c.displayName, status: c.isArchived ? "archived" : "active", archived: c.isArchived ?? false }));
  }

  async listMessages(channelId: string, parentId?: string): Promise<CommsMessage[]> {
    if (!parentId) {
      throw new CommsConnectProviderError(
        "MISSING_TEAM_ID",
        "Microsoft Teams: listing messages needs the real team id alongside the channel id - Teams' own API has no channel-only message endpoint."
      );
    }
    let response;
    try {
      response = await this.apiAdapter.get<TeamsMessagesResponse>(
        `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(parentId)}/channels/${encodeURIComponent(channelId)}/messages`,
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Microsoft Teams: network request failed while listing messages - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toChannelOrMessageError(response.status, response.error, "listing messages");
    }
    return response.data.value.map((m) => ({
      id: m.id,
      author: m.from?.user?.displayName ?? "unknown",
      text: stripHtmlToPlainText(m.body.content),
      timestamp: m.createdDateTime,
    }));
  }

  // Real POST /teams/{parentId}/channels/{channelId}/messages - same
  // team-id-plus-channel-id requirement as listMessages (Teams' API has
  // no channel-only send endpoint), and the same real 403 mapping below:
  // if this CLI-issued token's default Graph scopes don't include
  // ChannelMessage.Send, that surfaces here as a real, honest
  // MISSING_CONSENT error rather than a silent no-op.
  async sendMessage(channelId: string, text: string, parentId?: string): Promise<void> {
    if (!parentId) {
      throw new CommsConnectProviderError(
        "MISSING_TEAM_ID",
        "Microsoft Teams: sending a message needs the real team id alongside the channel id - Teams' own API has no channel-only message endpoint."
      );
    }
    let response;
    try {
      response = await this.apiAdapter.post<unknown>(
        `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(parentId)}/channels/${encodeURIComponent(channelId)}/messages`,
        { body: { content: text } },
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Microsoft Teams: network request failed while sending the message - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toChannelOrMessageError(response.status, response.error, "sending the message");
    }
  }

  private toChannelOrMessageError(status: number, error: string, action: string): CommsConnectProviderError {
    if (status === 403) {
      return new CommsConnectProviderError(
        "MISSING_CONSENT",
        `Microsoft Teams: ${action} failed (403) - this CLI-issued token's default scopes likely don't include the real Channel/ChannelMessage Graph permissions; ask your tenant admin to grant that consent to the Azure CLI client, or register your own app with the right scopes.`
      );
    }
    if (status === 401) {
      return new CommsConnectProviderError("TOKEN_REJECTED", `Microsoft Teams: ${action} failed (401) - the token may be invalid or expired.`);
    }
    return new CommsConnectProviderError("REQUEST_FAILED", `Microsoft Teams: ${action} failed (${status} ${error}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CommsConnectProvider.weave() comment.
  }
}
