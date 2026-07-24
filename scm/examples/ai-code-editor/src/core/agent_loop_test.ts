import { describe, it, expect } from "bun:test";
import { executeAgentTool, describeAction, toAgentStepHistory } from "./agent_loop.js";
import type { AgentUiMessage } from "./state.js";
import type { FileMap } from "./fs.js";

const FILES: FileMap = {
  "src/main.js": { content: "console.log('hi');", language: "javascript" },
  "src/utils/greet.js": { content: "export function greet() {}", language: "javascript" },
};
const EMPTY_FOLDERS: string[] = ["docs"];

describe("executeAgentTool read_file", () => {
  it("test_executeAgentTool_read_file_returns_content_for_an_existing_file", () => {
    const outcome = executeAgentTool("read_file", { path: "src/main.js" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({ kind: "immediate", output: "console.log('hi');", isError: false });
  });

  it("test_executeAgentTool_read_file_reports_an_error_for_a_missing_file", () => {
    const outcome = executeAgentTool("read_file", { path: "src/missing.js" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({ kind: "immediate", output: "No such file: src/missing.js", isError: true });
  });
});

describe("executeAgentTool list_files", () => {
  it("test_executeAgentTool_list_files_lists_the_project_root_when_path_is_omitted", () => {
    const outcome = executeAgentTool("list_files", {}, FILES, EMPTY_FOLDERS, "");
    expect(outcome.kind).toBe("immediate");
    expect((outcome as { output: string }).output).toContain("src/");
    expect((outcome as { output: string }).output).toContain("docs/");
  });

  it("test_executeAgentTool_list_files_lists_a_nested_path", () => {
    const outcome = executeAgentTool("list_files", { path: "src" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({ kind: "immediate", output: "utils/\nmain.js", isError: false });
  });

  it("test_executeAgentTool_list_files_reports_an_error_for_a_missing_path", () => {
    const outcome = executeAgentTool("list_files", { path: "nope" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({ kind: "immediate", output: "No such directory: nope", isError: true });
  });
});

describe("executeAgentTool run_command", () => {
  it("test_executeAgentTool_run_command_a_non_mutating_command_is_immediate", () => {
    const outcome = executeAgentTool("run_command", { command: "ls" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome.kind).toBe("immediate");
  });

  it("test_executeAgentTool_run_command_a_mutating_command_needs_confirmation", () => {
    const outcome = executeAgentTool("run_command", { command: "rm -r src" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({
      kind: "needs_confirm",
      summary: 'Delete folder "src"',
      action: { type: "DELETE_PATH", path: "src", isFolder: true },
    });
  });
});

describe("executeAgentTool write_file", () => {
  it("test_executeAgentTool_write_file_always_needs_confirmation_for_a_new_file", () => {
    const outcome = executeAgentTool("write_file", { path: "src/greeting.js", content: "export const x = 1;" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({
      kind: "needs_confirm",
      summary: 'Write file "src/greeting.js"',
      action: { type: "CREATE_FILE", path: "src/greeting.js", content: "export const x = 1;", language: "javascript" },
    });
  });

  it("test_executeAgentTool_write_file_always_needs_confirmation_when_overwriting_an_existing_file", () => {
    const outcome = executeAgentTool("write_file", { path: "src/main.js", content: "console.log('bye');" }, FILES, EMPTY_FOLDERS, "");
    expect(outcome.kind).toBe("needs_confirm");
    expect((outcome as { action: { path: string } }).action.path).toBe("src/main.js");
  });
});

describe("executeAgentTool list_agent_channels", () => {
  it("test_executeAgentTool_list_agent_channels_reports_none_enabled_when_no_channels_are_passed", () => {
    const outcome = executeAgentTool("list_agent_channels", {}, FILES, EMPTY_FOLDERS, "");
    expect(outcome).toEqual({
      kind: "immediate",
      output: "No channels enabled. Ask the user to enable some in Connect → Agent.",
      isError: false,
    });
  });

  it("test_executeAgentTool_list_agent_channels_lists_each_enabled_channel", () => {
    const outcome = executeAgentTool("list_agent_channels", {}, FILES, EMPTY_FOLDERS, "", [
      { kind: "comms", providerId: "slack", channelId: "C123", channelName: "general" },
      { kind: "socials", providerId: "mastodon", providerName: "Mastodon" },
    ]);
    expect(outcome).toEqual({
      kind: "immediate",
      output: "comms: slack #general (channelId=C123)\nsocials: mastodon (Mastodon)",
      isError: false,
    });
  });
});

describe("describeAction", () => {
  it("test_describeAction_describes_every_mutating_action_variant", () => {
    expect(describeAction({ type: "CREATE_FILE", path: "a.js", content: "", language: "javascript" })).toBe('Write file "a.js"');
    expect(describeAction({ type: "CREATE_FOLDER", path: "docs" })).toBe('Create folder "docs"');
    expect(describeAction({ type: "DELETE_PATH", path: "a.js", isFolder: false })).toBe('Delete file "a.js"');
    expect(describeAction({ type: "DELETE_PATH", path: "src", isFolder: true })).toBe('Delete folder "src"');
    expect(describeAction({ type: "RENAME_PATH", oldPath: "a.js", newPath: "b.js", isFolder: false })).toBe('Rename "a.js" to "b.js"');
    expect(describeAction({ type: "COPY_PATH", oldPath: "a.js", newPath: "b.js", isFolder: false })).toBe('Copy "a.js" to "b.js"');
  });
});

describe("toAgentStepHistory", () => {
  it("test_toAgentStepHistory_round_trips_a_confirmed_tool_call", () => {
    const transcript: AgentUiMessage[] = [
      { kind: "user", text: "write a greeting file", ts: 1 },
      { kind: "tool_call", id: "toolu_1", tool: "write_file", input: { path: "a.js", content: "x" }, text: "Sure.", ts: 2 },
      { kind: "tool_result", toolCallId: "toolu_1", text: 'Write file "a.js" — done.', isError: false, ts: 3 },
      { kind: "assistant", text: "Done!", ts: 4 },
    ];

    expect(toAgentStepHistory(transcript)).toEqual([
      { role: "user", content: "write a greeting file" },
      { role: "assistant", content: "Sure.", toolUse: { id: "toolu_1", name: "write_file", input: { path: "a.js", content: "x" } } },
      { role: "tool_result", toolUseId: "toolu_1", content: 'Write file "a.js" — done.', isError: false },
      { role: "assistant", content: "Done!" },
    ]);
  });

  it("test_toAgentStepHistory_round_trips_a_denied_tool_call", () => {
    const transcript: AgentUiMessage[] = [
      { kind: "tool_call", id: "toolu_2", tool: "run_command", input: { command: "rm -r src" }, ts: 1 },
      { kind: "tool_result", toolCallId: "toolu_2", text: "User denied this action.", isError: true, denied: true, ts: 2 },
    ];

    expect(toAgentStepHistory(transcript)).toEqual([
      { role: "assistant", content: "", toolUse: { id: "toolu_2", name: "run_command", input: { command: "rm -r src" } } },
      { role: "tool_result", toolUseId: "toolu_2", content: "User denied this action.", isError: true },
    ]);
  });

  it("test_toAgentStepHistory_omits_local_only_error_and_stopped_entries", () => {
    const transcript: AgentUiMessage[] = [
      { kind: "user", text: "hi", ts: 1 },
      { kind: "error", text: "no API key", ts: 2 },
      { kind: "stopped", ts: 3 },
    ];

    expect(toAgentStepHistory(transcript)).toEqual([{ role: "user", content: "hi" }]);
  });
});
