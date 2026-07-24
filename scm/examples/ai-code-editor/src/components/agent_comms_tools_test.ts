import { describe, it, expect } from "bun:test";
// HTMLElement/customElements are shimmed globally via bunfig.toml's
// [test].preload (test-dom-shim.ts) - core/socials_credentials.ts
// imports @justjs/provider-connect, whose component-view dependency
// defines classes with `extends HTMLElement` at module top level, which
// must exist before that module is even loaded, not just before it's used.
import { executeAgentCommsTool } from "./agent_comms_tools.js";
import type { AgentCommsToolDeps } from "./agent_comms_tools.js";
import type { AgentChannel } from "../core/agent_access.js";

const ENABLED: readonly AgentChannel[] = [
  { kind: "comms", id: "slack", name: "Slack" },
  { kind: "socials", id: "mastodon", name: "Mastodon" },
];

function fakeDeps(overrides: Partial<AgentCommsToolDeps> = {}): AgentCommsToolDeps {
  return {
    resolveCommsToken: () => "fake-token",
    sendCommsMessage: { slack: async () => {}, discord: async () => {}, teams: async () => {} },
    listCommsMessages: {
      slack: async () => [{ id: "1", author: "alice", text: "hi", timestamp: "100" }],
      discord: async () => [],
      teams: async () => [],
    },
    resolveMastodonToken: () => "mastodon-token",
    resolveBlueskyCredentials: () => ({ identifier: "alice.bsky.social", appPassword: "app-pass" }),
    postMastodonStatus: async () => {},
    postBlueskyPost: async () => {},
    ...overrides,
  };
}

describe("executeAgentCommsTool send_channel_message", () => {
  it("test_send_channel_message_rejects_a_disabled_provider_without_confirming", async () => {
    const outcome = await executeAgentCommsTool(
      "send_channel_message",
      { providerId: "discord", channelId: "C1", text: "hi" },
      ENABLED,
      fakeDeps()
    );
    expect(outcome).toEqual({
      kind: "immediate",
      output: '"discord" is not enabled for the agent - ask the user to enable it in Connect → Agent.',
      isError: true,
    });
  });

  it("test_send_channel_message_for_an_enabled_provider_needs_confirmation_with_a_real_summary", async () => {
    const outcome = await executeAgentCommsTool(
      "send_channel_message",
      { providerId: "slack", channelId: "C123", text: "hello team" },
      ENABLED,
      fakeDeps()
    );
    expect(outcome.kind).toBe("needs_confirm_effect");
    expect((outcome as { summary: string }).summary).toBe('Send to C123 on slack: "hello team"');
  });

  it("test_send_channel_message_defers_the_real_send_until_run_is_invoked", async () => {
    let called = false;
    const deps = fakeDeps({ sendCommsMessage: { slack: async () => { called = true; }, discord: async () => {}, teams: async () => {} } });
    const outcome = await executeAgentCommsTool("send_channel_message", { providerId: "slack", channelId: "C123", text: "hi" }, ENABLED, deps);
    expect(called).toBe(false);
    const result = await (outcome as { run: () => Promise<{ output: string; isError: boolean }> }).run();
    expect(called).toBe(true);
    expect(result).toEqual({ output: "Sent to C123 on slack.", isError: false });
  });

  it("test_send_channel_message_run_surfaces_a_real_provider_error_as_isError", async () => {
    const deps = fakeDeps({
      sendCommsMessage: {
        slack: async () => {
          throw new Error("Slack: request failed (channel_not_found).");
        },
        discord: async () => {},
        teams: async () => {},
      },
    });
    const outcome = await executeAgentCommsTool("send_channel_message", { providerId: "slack", channelId: "bad", text: "hi" }, ENABLED, deps);
    const result = await (outcome as { run: () => Promise<{ output: string; isError: boolean }> }).run();
    expect(result).toEqual({ output: "Slack: request failed (channel_not_found).", isError: true });
  });
});

describe("executeAgentCommsTool read_channel_messages", () => {
  it("test_read_channel_messages_rejects_a_disabled_provider", async () => {
    const outcome = await executeAgentCommsTool("read_channel_messages", { providerId: "discord", channelId: "C1" }, ENABLED, fakeDeps());
    expect(outcome.isError).toBe(true);
  });

  it("test_read_channel_messages_is_immediate_and_returns_real_formatted_content", async () => {
    const outcome = await executeAgentCommsTool("read_channel_messages", { providerId: "slack", channelId: "C123" }, ENABLED, fakeDeps());
    expect(outcome).toEqual({ kind: "immediate", output: "alice (100): hi", isError: false });
  });

  it("test_read_channel_messages_reports_no_messages_honestly", async () => {
    const enabled: readonly AgentChannel[] = [{ kind: "comms", id: "discord", name: "Discord" }];
    const outcome = await executeAgentCommsTool("read_channel_messages", { providerId: "discord", channelId: "C1" }, enabled, fakeDeps());
    expect(outcome).toEqual({ kind: "immediate", output: "(no messages)", isError: false });
  });

  it("test_read_channel_messages_surfaces_a_real_provider_error", async () => {
    const deps = fakeDeps({
      listCommsMessages: {
        slack: async () => {
          throw new Error("Slack: request failed (channel_not_found).");
        },
        discord: async () => [],
        teams: async () => [],
      },
    });
    const outcome = await executeAgentCommsTool("read_channel_messages", { providerId: "slack", channelId: "bad" }, ENABLED, deps);
    expect(outcome).toEqual({ kind: "immediate", output: "Slack: request failed (channel_not_found).", isError: true });
  });
});

describe("executeAgentCommsTool create_social_post", () => {
  it("test_create_social_post_rejects_a_disabled_provider", async () => {
    const enabled: readonly AgentChannel[] = [];
    const outcome = await executeAgentCommsTool("create_social_post", { providerId: "mastodon", text: "hi" }, enabled, fakeDeps());
    expect(outcome.isError).toBe(true);
  });

  it("test_create_social_post_for_mastodon_needs_confirmation_and_defers_the_real_post", async () => {
    let called = false;
    const deps = fakeDeps({ postMastodonStatus: async () => { called = true; } });
    const outcome = await executeAgentCommsTool("create_social_post", { providerId: "mastodon", text: "hello world" }, ENABLED, deps);
    expect(outcome.kind).toBe("needs_confirm_effect");
    expect((outcome as { summary: string }).summary).toBe('Post to Mastodon: "hello world"');
    expect(called).toBe(false);
    const result = await (outcome as { run: () => Promise<{ output: string; isError: boolean }> }).run();
    expect(called).toBe(true);
    expect(result).toEqual({ output: "Posted to Mastodon.", isError: false });
  });

  it("test_create_social_post_for_bluesky_needs_confirmation_and_defers_the_real_post", async () => {
    const enabled: readonly AgentChannel[] = [{ kind: "socials", id: "bluesky", name: "Bluesky" }];
    let called = false;
    const deps = fakeDeps({ postBlueskyPost: async () => { called = true; } });
    const outcome = await executeAgentCommsTool("create_social_post", { providerId: "bluesky", text: "hello world" }, enabled, deps);
    expect(outcome.kind).toBe("needs_confirm_effect");
    expect(called).toBe(false);
    const result = await (outcome as { run: () => Promise<{ output: string; isError: boolean }> }).run();
    expect(called).toBe(true);
    expect(result).toEqual({ output: "Posted to Bluesky.", isError: false });
  });

  it("test_create_social_post_for_bluesky_without_stored_credentials_is_a_real_immediate_error", async () => {
    const enabled: readonly AgentChannel[] = [{ kind: "socials", id: "bluesky", name: "Bluesky" }];
    const deps = fakeDeps({ resolveBlueskyCredentials: () => null });
    const outcome = await executeAgentCommsTool("create_social_post", { providerId: "bluesky", text: "hi" }, enabled, deps);
    expect(outcome).toEqual({ kind: "immediate", output: "Bluesky is not connected.", isError: true });
  });

  it("test_create_social_post_rejects_reddit_as_structurally_unsupported_even_if_somehow_enabled", async () => {
    const enabled: readonly AgentChannel[] = [{ kind: "socials", id: "reddit", name: "Reddit" }];
    const outcome = await executeAgentCommsTool("create_social_post", { providerId: "reddit", text: "hi" }, enabled, fakeDeps());
    expect(outcome).toEqual({
      kind: "immediate",
      output: '"reddit" cannot post as a user with its stored credential (Reddit\'s is app-only client_credentials) - not supported.',
      isError: true,
    });
  });
});
