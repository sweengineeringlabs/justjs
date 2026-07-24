// Comms/Socials tools for Chat's Agent mode (justjs#136) - kept
// separate from core/agent_loop.ts because these need real credentials
// and real network calls, which agent_loop.ts deliberately never
// touches (see its own file header comment). Lives in the component
// layer, like agent_channels.ts, for exactly that reason.
//
// Every tool call re-validates the target provider is in
// `enabledChannels` (already both connected-and-agent-enabled, from
// getEnabledAgentChannels()) before doing anything - access is
// provider-level, matching the granularity Connect → Agent's own
// checkboxes offer, not a new per-channel restriction.
import type { AgentToolDefinition } from "@justjs/ai-assist";
import type { AgentChannel } from "../core/agent_access.js";
import type { AgentToolOutcome } from "../core/agent_loop.js";
import type { CommsMessage } from "../core/comms_connect.js";
import { getStoredCommsToken } from "../core/comms_credentials.js";
import { listSlackMessages, listDiscordMessages, listTeamsMessages, sendSlackMessage, sendDiscordMessage, sendTeamsMessage } from "../core/comms_connect.js";
import { getStoredSocialToken, getStoredBlueskyCredentials } from "../core/socials_credentials.js";
import { postMastodonStatus, postBlueskyPost } from "../core/socials_connect.js";

export const COMMS_AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "send_channel_message",
    description:
      "Send a real message to a connected, agent-enabled Comms channel (Slack, Discord, or Microsoft Teams). Requires user " +
      "confirmation before sending. parentId is required for Microsoft Teams only (the real team id) - omit for Slack/Discord.",
    inputSchema: {
      type: "object",
      properties: {
        providerId: { type: "string", enum: ["slack", "discord", "teams"] },
        channelId: { type: "string" },
        text: { type: "string" },
        parentId: { type: "string" },
      },
      required: ["providerId", "channelId", "text"],
    },
  },
  {
    name: "read_channel_messages",
    description:
      "Read recent real messages from a connected, agent-enabled Comms channel (Slack, Discord, or Microsoft Teams). " +
      "Read-only, no confirmation needed. parentId is required for Microsoft Teams only.",
    inputSchema: {
      type: "object",
      properties: {
        providerId: { type: "string", enum: ["slack", "discord", "teams"] },
        channelId: { type: "string" },
        parentId: { type: "string" },
      },
      required: ["providerId", "channelId"],
    },
  },
  {
    name: "create_social_post",
    description:
      "Post real content to a connected, agent-enabled Socials provider (Mastodon or Bluesky only - Reddit's stored " +
      "credential is app-only and cannot post as a user). Requires user confirmation before posting.",
    inputSchema: {
      type: "object",
      properties: { providerId: { type: "string", enum: ["mastodon", "bluesky"] }, text: { type: "string" } },
      required: ["providerId", "text"],
    },
  },
];

// Normalized (token, channelId, parentId) signatures, same shape
// components/communication.ts's own COMMS_MESSAGE_LISTERS table already
// established for exactly this Slack/Discord/Teams asymmetry.
const COMMS_SEND: Record<string, (token: string, channelId: string, text: string, parentId: string) => Promise<void>> = {
  slack: (token, channelId, text) => sendSlackMessage(token, channelId, text),
  discord: (token, channelId, text) => sendDiscordMessage(token, channelId, text),
  teams: (token, channelId, text, parentId) => sendTeamsMessage(token, channelId, text, parentId),
};

const COMMS_LIST: Record<string, (token: string, channelId: string, parentId: string) => Promise<CommsMessage[]>> = {
  slack: (token, channelId) => listSlackMessages(token, channelId),
  discord: (token, channelId) => listDiscordMessages(token, channelId),
  teams: (token, channelId, parentId) => listTeamsMessages(token, channelId, parentId),
};

// Dependency-injected so classification logic (enabled/disabled
// rejection, summary text, immediate-vs-confirm split) is unit-testable
// with fakes, never touching real localStorage/network in tests.
export interface AgentCommsToolDeps {
  readonly resolveCommsToken: (providerId: string) => string;
  readonly sendCommsMessage: Record<string, (token: string, channelId: string, text: string, parentId: string) => Promise<void>>;
  readonly listCommsMessages: Record<string, (token: string, channelId: string, parentId: string) => Promise<CommsMessage[]>>;
  readonly resolveMastodonToken: () => string;
  readonly resolveBlueskyCredentials: () => { readonly identifier: string; readonly appPassword: string } | null;
  readonly postMastodonStatus: (token: string, text: string) => Promise<void>;
  readonly postBlueskyPost: (identifier: string, appPassword: string, text: string) => Promise<void>;
}

const REAL_DEPS: AgentCommsToolDeps = {
  resolveCommsToken: getStoredCommsToken,
  sendCommsMessage: COMMS_SEND,
  listCommsMessages: COMMS_LIST,
  resolveMastodonToken: () => getStoredSocialToken("mastodon"),
  resolveBlueskyCredentials: () => getStoredBlueskyCredentials(),
  postMastodonStatus,
  postBlueskyPost,
};

function isEnabled(enabledChannels: readonly AgentChannel[], kind: "comms" | "socials", providerId: string): boolean {
  return enabledChannels.some((c) => c.kind === kind && c.id === providerId);
}

function notEnabled(providerId: string): AgentToolOutcome {
  return {
    kind: "immediate",
    output: `"${providerId}" is not enabled for the agent - ask the user to enable it in Connect → Agent.`,
    isError: true,
  };
}

export async function executeAgentCommsTool(
  name: string,
  input: unknown,
  enabledChannels: readonly AgentChannel[],
  deps: AgentCommsToolDeps = REAL_DEPS
): Promise<AgentToolOutcome> {
  const args = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case "send_channel_message": {
      const providerId = String(args.providerId ?? "");
      const channelId = String(args.channelId ?? "");
      const text = String(args.text ?? "");
      const parentId = typeof args.parentId === "string" ? args.parentId : "";
      if (!isEnabled(enabledChannels, "comms", providerId)) {
        return notEnabled(providerId);
      }
      const sendFn = deps.sendCommsMessage[providerId];
      if (!sendFn) {
        return { kind: "immediate", output: `Unknown Comms provider: ${providerId}`, isError: true };
      }
      const token = deps.resolveCommsToken(providerId);
      return {
        kind: "needs_confirm_effect",
        summary: `Send to ${channelId} on ${providerId}: "${text}"`,
        run: async () => {
          try {
            await sendFn(token, channelId, text, parentId);
            return { output: `Sent to ${channelId} on ${providerId}.`, isError: false };
          } catch (e) {
            return { output: e instanceof Error ? e.message : String(e), isError: true };
          }
        },
      };
    }

    case "read_channel_messages": {
      const providerId = String(args.providerId ?? "");
      const channelId = String(args.channelId ?? "");
      const parentId = typeof args.parentId === "string" ? args.parentId : "";
      if (!isEnabled(enabledChannels, "comms", providerId)) {
        return notEnabled(providerId);
      }
      const listFn = deps.listCommsMessages[providerId];
      if (!listFn) {
        return { kind: "immediate", output: `Unknown Comms provider: ${providerId}`, isError: true };
      }
      const token = deps.resolveCommsToken(providerId);
      try {
        const messages = await listFn(token, channelId, parentId);
        if (messages.length === 0) {
          return { kind: "immediate", output: "(no messages)", isError: false };
        }
        return { kind: "immediate", output: messages.map((m) => `${m.author} (${m.timestamp}): ${m.text}`).join("\n"), isError: false };
      } catch (e) {
        return { kind: "immediate", output: e instanceof Error ? e.message : String(e), isError: true };
      }
    }

    case "create_social_post": {
      const providerId = String(args.providerId ?? "");
      const text = String(args.text ?? "");
      if (!isEnabled(enabledChannels, "socials", providerId)) {
        return notEnabled(providerId);
      }
      if (providerId === "mastodon") {
        const token = deps.resolveMastodonToken();
        return {
          kind: "needs_confirm_effect",
          summary: `Post to Mastodon: "${text}"`,
          run: async () => {
            try {
              await deps.postMastodonStatus(token, text);
              return { output: "Posted to Mastodon.", isError: false };
            } catch (e) {
              return { output: e instanceof Error ? e.message : String(e), isError: true };
            }
          },
        };
      }
      if (providerId === "bluesky") {
        const credentials = deps.resolveBlueskyCredentials();
        if (!credentials) {
          return { kind: "immediate", output: "Bluesky is not connected.", isError: true };
        }
        return {
          kind: "needs_confirm_effect",
          summary: `Post to Bluesky: "${text}"`,
          run: async () => {
            try {
              await deps.postBlueskyPost(credentials.identifier, credentials.appPassword, text);
              return { output: "Posted to Bluesky.", isError: false };
            } catch (e) {
              return { output: e instanceof Error ? e.message : String(e), isError: true };
            }
          },
        };
      }
      return {
        kind: "immediate",
        output: `"${providerId}" cannot post as a user with its stored credential (Reddit's is app-only client_credentials) - not supported.`,
        isError: true,
      };
    }

    default:
      return { kind: "immediate", output: `Unknown tool: ${name}`, isError: true };
  }
}
