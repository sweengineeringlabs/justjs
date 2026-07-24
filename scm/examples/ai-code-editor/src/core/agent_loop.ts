// Pure tool-execution logic for Chat's Agent mode (justjs#134) - no
// store/DOM access, mirrors core/cli.ts's own "helpers stay pure, caller
// dispatches" split. chat.ts owns the loop, the transcript, and the
// confirm-before-apply gate; this module only classifies each tool call
// as safe-to-run-immediately or needs-user-confirmation, and executes the
// safe ones.

import type { AgentStepMessage, AgentToolDefinition } from "@justjs/ai-assist";
import type { AppAction } from "./state.js";
import type { AgentUiMessage } from "./state.js";
import { findChildren, runCliCommand } from "./cli.js";
import { buildTree, inferLanguage, normalizePath } from "./fs.js";
import type { FileMap, TreeNode } from "./fs.js";
import type { AgentChannel } from "./agent_access.js";

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: "read_file",
    description: "Read the full contents of a file in the project by path.",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
  {
    name: "list_files",
    description: "List files and folders under a path (omit path for the project root).",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
  },
  {
    name: "run_command",
    description:
      "Run one command against the project's virtual filesystem (pwd, ls, cd, cat, mkdir, touch, rm, mv, cp, " +
      "grep, find, echo). File-mutating commands (mkdir/touch/rm/mv/cp) require user confirmation.",
    inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
  },
  {
    name: "write_file",
    description: "Create a new file or overwrite an existing file's full contents. Requires user confirmation.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "list_agent_channels",
    description:
      "List the communication/social channels (e.g. Slack, Discord, Mastodon) the user has connected AND explicitly " +
      "enabled for the agent to use, configured in Connect → Agent. Returns none if the user hasn't enabled any yet - " +
      "there is no tool to post/read on a channel, only to see what's been authorized.",
    inputSchema: { type: "object", properties: {} },
  },
];

// A hard, non-configurable bound on how many agentStep() round-trips one
// user turn may spend - "no unbounded loops" is a project-wide rule, and
// this cap survives across confirm/deny pauses (chat.ts increments a
// field, not a local loop variable, precisely so a pause can't reset it).
export const MAX_AGENT_ITERATIONS = 8;

export type AgentToolOutcome =
  | { readonly kind: "immediate"; readonly output: string; readonly isError: boolean; readonly cwd?: string }
  | { readonly kind: "needs_confirm"; readonly summary: string; readonly action: AppAction }
  // Same confirm-before-apply gate as "needs_confirm", but for an action
  // whose real effect is a network call (e.g. justjs#136's
  // send_channel_message/create_social_post), not a synchronous FileMap
  // reducer dispatch - `run` is a real closure, already carrying whatever
  // credentials/args it needs (built by whichever component-layer module
  // classified the tool call - this module itself never touches
  // credentials, see the file header comment), invoked only once the
  // user actually confirms.
  | { readonly kind: "needs_confirm_effect"; readonly summary: string; readonly run: () => Promise<{ readonly output: string; readonly isError: boolean }> };

function findChildrenOutcome(files: FileMap, emptyFolders: string[], rawPath: string | undefined): AgentToolOutcome {
  const path = rawPath ? normalizePath(rawPath) : "";
  const children: TreeNode[] | null = findChildren(buildTree(files, emptyFolders), path);
  if (children === null) {
    return { kind: "immediate", output: `No such directory: ${path || "/"}`, isError: true };
  }
  if (children.length === 0) {
    return { kind: "immediate", output: "(empty)", isError: false };
  }
  return {
    kind: "immediate",
    output: children.map((n) => (n.type === "folder" ? `${n.name}/` : n.name)).join("\n"),
    isError: false,
  };
}

export function executeAgentTool(
  name: string,
  input: unknown,
  files: FileMap,
  emptyFolders: string[],
  cwd: string,
  channels: readonly AgentChannel[] = []
): AgentToolOutcome {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "read_file": {
      const path = normalizePath(String(args.path ?? ""));
      const file = files[path];
      if (!file) {
        return { kind: "immediate", output: `No such file: ${path}`, isError: true };
      }
      return { kind: "immediate", output: file.content, isError: false };
    }

    case "list_files":
      return findChildrenOutcome(files, emptyFolders, typeof args.path === "string" ? args.path : undefined);

    case "run_command": {
      const command = String(args.command ?? "");
      const result = runCliCommand(command, cwd, files, emptyFolders);
      if (result.action) {
        return { kind: "needs_confirm", summary: describeAction(result.action), action: result.action };
      }
      return { kind: "immediate", output: result.output, isError: result.isError ?? false, cwd: result.cwd };
    }

    case "write_file": {
      const path = normalizePath(String(args.path ?? ""));
      const content = String(args.content ?? "");
      const action: AppAction = { type: "CREATE_FILE", path, content, language: inferLanguage(path) };
      return { kind: "needs_confirm", summary: describeAction(action), action };
    }

    case "list_agent_channels": {
      if (channels.length === 0) {
        return { kind: "immediate", output: "No channels enabled. Ask the user to enable some in Connect → Agent.", isError: false };
      }
      const lines = channels.map((c) =>
        c.kind === "comms"
          ? `comms: ${c.providerId} #${c.channelName} (channelId=${c.channelId})`
          : `socials: ${c.providerId} (${c.providerName})`
      );
      return { kind: "immediate", output: lines.join("\n"), isError: false };
    }

    default:
      return { kind: "immediate", output: `Unknown tool: ${name}`, isError: true };
  }
}

export function describeAction(action: AppAction): string {
  switch (action.type) {
    case "CREATE_FILE":
      return `Write file "${action.path}"`;
    case "CREATE_FOLDER":
      return `Create folder "${action.path}"`;
    case "DELETE_PATH":
      return `Delete ${action.isFolder ? "folder" : "file"} "${action.path}"`;
    case "RENAME_PATH":
      return `Rename "${action.oldPath}" to "${action.newPath}"`;
    case "COPY_PATH":
      return `Copy "${action.oldPath}" to "${action.newPath}"`;
    default:
      return `Apply ${action.type}`;
  }
}

// Replays a transcript into the AgentStepMessage[] shape agentStep()
// expects - the inverse of the append-only transcript chat.ts builds as
// the loop runs. tool_call/tool_result pairs are merged back into one
// assistant message (carrying toolUse) followed by one tool_result
// message, matching Anthropic's own expected message sequence.
export function toAgentStepHistory(messages: readonly AgentUiMessage[]): AgentStepMessage[] {
  const history: AgentStepMessage[] = [];
  for (const message of messages) {
    switch (message.kind) {
      case "user":
        history.push({ role: "user", content: message.text });
        break;
      case "assistant":
        history.push({ role: "assistant", content: message.text });
        break;
      case "tool_call":
        history.push({
          role: "assistant",
          content: message.text ?? "",
          toolUse: { id: message.id, name: message.tool, input: message.input },
        });
        break;
      case "tool_result":
        history.push({ role: "tool_result", toolUseId: message.toolCallId, content: message.text, isError: message.isError });
        break;
      case "error":
      case "stopped":
        // Neither is a real Anthropic turn - "error" is a local failure
        // (e.g. no API key) that never reached the model, "stopped" is a
        // local UI event. Replaying either would desync the assistant/
        // tool_result pairing the message sequence must maintain.
        break;
    }
  }
  return history;
}
