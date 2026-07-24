import type { ApiAdapter } from "@justjs/transport";
import type { CommsConnectProvider, CommsResource, CommsMessage, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";
import { DefaultCommsConnectProvider } from "./default_comms_connect_provider.js";
import type { CommsProviderDescriptor } from "./default_comms_connect_provider.js";

const DISCORD_GUILDS_DESCRIPTOR: CommsProviderDescriptor = {
  strategy: "discord",
  name: "Discord",
  url: "https://discord.com/api/v10/users/@me/guilds",
  // Discord's own documented convention for bot tokens - not "Bearer"
  // (that scheme is for OAuth user tokens instead).
  authScheme: "Bot",
  parse: (data) =>
    (data as Array<{ id: string; name: string; owner?: boolean }>).map((g) => ({
      id: g.id,
      name: g.name,
      status: g.owner ? "owner" : "member",
    })),
};

// Real Discord channel `type` values (confirmed via Discord's own
// docs) - only 0 (GUILD_TEXT) is a real text channel a message thread
// makes sense for; voice channels (2) and categories (4) are real
// Discord concepts but never something this app lists messages from.
const GUILD_TEXT_CHANNEL_TYPE = 0;

interface DiscordChannel {
  readonly id: string;
  readonly name: string;
  readonly type: number;
}

interface DiscordMessage {
  readonly id: string;
  readonly content: string;
  readonly timestamp: string;
  readonly author: { readonly username: string };
}

// Discord - real distinct logic, not a plain DefaultCommsConnectProvider
// instance: connect() keeps that same generic engine's real "list
// guilds" behavior (unchanged), but Discord's own guild-list API is one
// real level shallower than a channel - listChannels()/listMessages()
// add the 2 real calls needed to reach an actual message thread.
// Deliberately no markAsRead() - Discord bot tokens have zero real
// read-state capability (confirmed via Discord's own docs/community:
// read-state is a per-user-account client feature, not something a bot
// token can see or set).
export class DiscordCommsConnectProvider implements CommsConnectProvider {
  readonly concern = "commsConnect" as const;
  readonly strategy = "discord";
  private readonly guildsEngine: DefaultCommsConnectProvider;

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.guildsEngine = new DefaultCommsConnectProvider(DISCORD_GUILDS_DESCRIPTOR, config, this.apiAdapter);
  }

  connect(): Promise<CommsResource[]> {
    return this.guildsEngine.connect();
  }

  async listChannels(guildId: string): Promise<CommsResource[]> {
    let response;
    try {
      response = await this.apiAdapter.get<DiscordChannel[]>(`https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/channels`, {
        headers: { Authorization: `Bot ${this.config.token}` },
      });
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Discord: network request failed while listing channels - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Discord: listing channels failed (${response.status} ${response.error}).`);
    }
    return response.data
      .filter((c) => c.type === GUILD_TEXT_CHANNEL_TYPE)
      .map((c) => ({ id: c.id, name: c.name, status: "text" }));
  }

  async listMessages(channelId: string): Promise<CommsMessage[]> {
    let response;
    try {
      response = await this.apiAdapter.get<DiscordMessage[]>(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages?limit=50`, {
        headers: { Authorization: `Bot ${this.config.token}` },
      });
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Discord: network request failed while listing messages - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Discord: listing messages failed (${response.status} ${response.error}).`);
    }
    return response.data.map((m) => ({ id: m.id, author: m.author.username, text: m.content, timestamp: m.timestamp }));
  }

  // Real POST /channels/{id}/messages - sends as the bot identity (this
  // app's bearer-shaped bot token), same posture as every other real
  // call in this provider.
  async sendMessage(channelId: string, text: string): Promise<void> {
    let response;
    try {
      response = await this.apiAdapter.post<DiscordMessage>(
        `https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`,
        { content: text },
        { headers: { Authorization: `Bot ${this.config.token}` } }
      );
    } catch {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        "Discord: network request failed while sending the message - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw new CommsConnectProviderError("REQUEST_FAILED", `Discord: sending the message failed (${response.status} ${response.error}).`);
    }
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CommsConnectProvider.weave() comment.
  }
}
