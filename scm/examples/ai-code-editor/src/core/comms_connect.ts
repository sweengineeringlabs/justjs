// Thin app-local adapter over the real @justjs/comms-connect package -
// same role core/cloud_connect.ts/core/scm_connect.ts play for their
// own packages.
import { createCommsConnectProvider } from "@justjs/comms-connect";
import type { CommsResource, CommsMessage } from "@justjs/comms-connect";

export type { CommsResource, CommsMessage };

export function connectSlack(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("slack", { token }).connect();
}

// Discord's own documented convention for bot tokens - the real
// `Authorization: Bot <token>` header (not Bearer) is applied inside
// @justjs/comms-connect, not here.
export function connectDiscord(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("discord", { token }).connect();
}

// Token comes from `az account get-access-token --resource-type
// ms-graph --query accessToken -o tsv` - real, short-lived, same
// CLI-token pattern Azure already uses in @justjs/cloud-connect.
export function connectTeams(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("teams", { token }).connect();
}

// Real per-channel message thread + Slack's own real (bot-cursor-only)
// mark-as-read - see @justjs/comms-connect's SlackCommsConnectProvider.
export function listSlackMessages(token: string, channelId: string): Promise<CommsMessage[]> {
  return createCommsConnectProvider("slack", { token }).listMessages!(channelId);
}

export function markSlackRead(token: string, channelId: string, latestTimestamp: string): Promise<void> {
  return createCommsConnectProvider("slack", { token }).markAsRead!(channelId, latestTimestamp);
}

// Real chat.postMessage, sent as the bot identity - see
// @justjs/comms-connect's SlackCommsConnectProvider.
export function sendSlackMessage(token: string, channelId: string, text: string): Promise<void> {
  return createCommsConnectProvider("slack", { token }).sendMessage!(channelId, text);
}

// Discord's connect() only returns guilds (one real level shallower
// than a channel) - these 2 add the real channels-then-messages
// drill-down. No markAsRead - Discord bot tokens have zero real
// read-state capability (see @justjs/comms-connect's DiscordCommsConnectProvider).
export function listDiscordChannels(token: string, guildId: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("discord", { token }).listChannels!(guildId);
}

export function listDiscordMessages(token: string, channelId: string): Promise<CommsMessage[]> {
  return createCommsConnectProvider("discord", { token }).listMessages!(channelId);
}

export function sendDiscordMessage(token: string, channelId: string, text: string): Promise<void> {
  return createCommsConnectProvider("discord", { token }).sendMessage!(channelId, text);
}

// Teams' connect() only returns joined teams - same real 2-level
// drill-down as Discord. listTeamsMessages needs both the real team id
// and channel id together (Teams' own message endpoint has no
// channel-only shape) - see @justjs/comms-connect's TeamsCommsConnectProvider.
// No markAsRead - Teams has no real read-state capability reachable via
// this app's CLI-delegated token.
export function listTeamsChannels(token: string, teamId: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("teams", { token }).listChannels!(teamId);
}

export function listTeamsMessages(token: string, channelId: string, teamId: string): Promise<CommsMessage[]> {
  return createCommsConnectProvider("teams", { token }).listMessages!(channelId, teamId);
}

export function sendTeamsMessage(token: string, channelId: string, text: string, teamId: string): Promise<void> {
  return createCommsConnectProvider("teams", { token }).sendMessage!(channelId, text, teamId);
}
