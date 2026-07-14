import type { AspectTarget } from "@justjs/application";

// A real channel/guild/team returned by a provider's own real list API.
// `status` is provider-specific vocabulary as-is (Slack's channel
// privacy, Discord's guild owner flag, Teams' visibility) - kept
// identical in shape to @justjs/cloud-connect's CloudResource /
// @justjs/scm-connect's ScmResource on purpose, so a consuming app's UI
// markup/CSS can be shared across all three concerns.
export interface CommsResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  // Real, optional - Slack's conversations.list and Teams' channel-list
  // both really expose an archived flag, kept as its own field rather
  // than folded into `status` (which Slack already uses for a real,
  // different thing - private/public). Undefined where a provider has
  // no real archived concept (Discord's own guild/channel objects don't
  // carry one for a bot token) - never fabricated as `false`.
  readonly archived?: boolean;
}

// All 3 real providers (Slack/Discord/Microsoft Teams) use a single
// bearer-shaped token - a real bot token or CLI-issued access token.
// The auth header *scheme* varies (see DefaultCommsConnectProvider's
// configurable authScheme) but the credential itself is always one
// string.
export interface BearerTokenConfig {
  readonly token: string;
}

// A real message returned by a provider's own real message-list API -
// `author` is a real display name/username (never an opaque id alone),
// `timestamp` is kept as each provider's own real string form (Slack's
// `ts`, Discord's/Teams' ISO 8601) rather than normalized, since a
// caller wanting a real Date only needs to parse it once, not have this
// package guess a canonical format.
export interface CommsMessage {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly timestamp: string;
}

export interface CommsConnectProvider {
  readonly concern: "commsConnect";
  readonly strategy: string;
  // Proves the token actually works and returns the account's real
  // channels/guilds/teams.
  connect(): Promise<CommsResource[]>;
  // Discord/Teams only, optional: their own connect() returns the
  // top-level guild/team, one real level shallower than a channel -
  // this lists the real channels inside a given guild/team id. Slack's
  // connect() already returns channels directly, so Slack never
  // implements this. Absent (not a no-op) on any provider without a
  // real distinct "list channels within X" API.
  listChannels?(parentId: string): Promise<CommsResource[]>;
  // All 3 providers, optional in the type (but real and implemented by
  // every one of them in practice) - lists a real channel's real recent
  // messages. `parentId` is Teams-only: its real message-list endpoint
  // needs both the team id and the channel id together (`GET /teams/
  // {parentId}/channels/{channelId}/messages`), unlike Slack's/Discord's
  // own message endpoints which only need the channel id - ignored by
  // every other provider.
  listMessages?(channelId: string, parentId?: string): Promise<CommsMessage[]>;
  // Slack-only, optional: marks a channel read via Slack's real
  // conversations.mark. A real, honest limitation - since this app
  // authenticates as a bot, this moves the *bot's own* read cursor, not
  // any human user's; Discord bot tokens and Teams' app-only/CLI-
  // delegated tokens have no read-state capability at all (confirmed
  // via each provider's own docs), so neither ever implements this.
  markAsRead?(channelId: string, latestTimestamp: string): Promise<void>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - commsConnect isn't
  // a rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as CloudConnectProvider.weave()/
  // ScmConnectProvider.weave().
  weave(target: AspectTarget): void;
}

export class CommsConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CommsConnectProviderError";
  }
}
