// Real local preference, same storage convention as comms_credentials.ts/
// socials_credentials.ts - which already-connected Communication/Socials
// channels the user has explicitly authorized Chat's Agent mode
// (justjs#134) to see. Deliberately separate from "connected" (the
// token/credential stores already cover that) - disconnecting a provider
// elsewhere must not silently leave it agent-enabled, and enabling a
// provider here before it's connected must not silently expose it either.
// See components/agent_channels.ts's getEnabledAgentChannels(), which
// always re-checks both before the agent ever sees anything.
//
// Comms is channel-level (Slack/Discord/Teams have real, individually
// addressable channels - enabling "Slack" as a whole would let the agent
// touch any channel it can name, a real, previously-flagged limitation).
// Socials stays provider-level - Mastodon/Bluesky have no "channel"
// concept, only a single personal timeline to post to, so there is
// nothing finer-grained to select.

export interface AgentChannelRef {
  readonly id: string;
  readonly name: string;
}

export interface AgentAccessSettings {
  readonly commsChannels: Readonly<Record<string, readonly AgentChannelRef[]>>;
  readonly socialsProviderIds: readonly string[];
}

const DEFAULT_AGENT_ACCESS: AgentAccessSettings = { commsChannels: {}, socialsProviderIds: [] };
const AGENT_ACCESS_STORAGE_KEY = "justjs:ai-editor:agent-access";

export function getStoredAgentAccess(): AgentAccessSettings {
  try {
    const raw = globalThis.localStorage?.getItem(AGENT_ACCESS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AGENT_ACCESS;
    }
    const parsed = JSON.parse(raw) as Partial<AgentAccessSettings>;
    return {
      commsChannels: parsed.commsChannels && typeof parsed.commsChannels === "object" ? parsed.commsChannels : DEFAULT_AGENT_ACCESS.commsChannels,
      socialsProviderIds: Array.isArray(parsed.socialsProviderIds) ? parsed.socialsProviderIds : DEFAULT_AGENT_ACCESS.socialsProviderIds,
    };
  } catch {
    return DEFAULT_AGENT_ACCESS;
  }
}

export function setStoredAgentAccess(settings: AgentAccessSettings): void {
  try {
    globalThis.localStorage?.setItem(AGENT_ACCESS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

// One connected+agent-enabled channel/provider, kind-tagged so
// agent_loop.ts's list_agent_channels tool result can tell a specific
// Slack channel apart from a Mastodon account without needing either
// provider catalog itself - agent_loop.ts stays pure/core (no component
// imports), per its own file header comment.
export type AgentChannel =
  | { readonly kind: "comms"; readonly providerId: string; readonly channelId: string; readonly channelName: string }
  | { readonly kind: "socials"; readonly providerId: string; readonly providerName: string };
