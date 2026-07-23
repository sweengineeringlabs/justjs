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
];

// A hard, non-configurable bound on how many agentStep() round-trips one
// user turn may spend - "no unbounded loops" is a project-wide rule, and
// this cap survives across confirm/deny pauses (chat.ts increments a
// field, not a local loop variable, precisely so a pause can't reset it).
export const MAX_AGENT_ITERATIONS = 8;

export type AgentToolOutcome =
  | { readonly kind: "immediate"; readonly output: string; readonly isError: boolean; readonly cwd?: string }
  | { readonly kind: "needs_confirm"; readonly summary: string; readonly action: AppAction };

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
  cwd: string
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
