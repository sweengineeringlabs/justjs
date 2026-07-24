import { describe, it, expect } from "bun:test";
import { Window } from "happy-dom";
// teams_provider.ts's stripHtmlToPlainText() uses the browser's native
// global DOMParser - real in any actual browser, but plain `bun test`
// has no DOM at all. Same happy-dom shim pattern @justjs/cloud-connect's
// own AWS XML-parsing test already established.
(globalThis as { DOMParser?: unknown }).DOMParser = new Window().DOMParser;
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { SlackCommsConnectProvider } from "../core/slack_provider.js";
import { DiscordCommsConnectProvider } from "../core/discord_provider.js";
import { TeamsCommsConnectProvider } from "../core/teams_provider.js";
import { CommsConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["slack", "discord", "teams"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's/
// @justjs/cloud-connect's/@justjs/scm-connect's own test harnesses
// exactly - zero real network calls in this suite. Also queues real
// post() calls (Slack's conversations.mark needs one).
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { method: "get" | "post"; url: string; body?: unknown; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  private async next<T>(): Promise<ApiResponse<T>> {
    const fn = this.responses.shift();
    if (!fn) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await fn()) as ApiResponse<T>;
  }

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "get", url, options });
    return this.next<T>();
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "post", url, body, options });
    return this.next<T>();
  }

  async put<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.put() is not exercised by any comms-connect provider");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any comms-connect provider");
  }
}

describe("SlackCommsConnectProvider", () => {
  it("test_connect_with_a_real_200_but_ok_false_body_throws_a_real_error", async () => {
    // The one behavior a naive HTTP-status check (DefaultCommsConnectProvider's
    // approach) would silently miss - Slack always answers 200, even on
    // auth failure, confirmed live against the real API this session.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { ok: false, error: "invalid_auth" },
    }));
    const provider = new SlackCommsConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(invalid_auth\)/);
  });

  it("test_connect_parses_real_channel_shape_including_privacy_and_archived_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        ok: true,
        channels: [
          { id: "C123", name: "general", is_private: false },
          { id: "C456", name: "old-project", is_private: false, is_archived: true },
        ],
      },
    }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://slack.com/api/conversations.list");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([
      { id: "C123", name: "general", status: "public", archived: false },
      { id: "C456", name: "old-project", status: "public", archived: true },
    ]);
  });

  it("test_connect_with_a_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new SlackCommsConnectProvider({ token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.connect();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CommsConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("SlackCommsConnectProvider - messages", () => {
  it("test_list_messages_sends_the_real_channel_and_parses_real_message_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { ok: true, messages: [{ ts: "1512085950.000216", user: "U123ABC456", text: "hello team" }] },
    }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    const messages = await provider.listMessages!("C123");
    expect(adapter.calls[0]!.url).toBe("https://slack.com/api/conversations.history?channel=C123&limit=50");
    expect(messages).toEqual([{ id: "1512085950.000216", author: "U123ABC456", text: "hello team", timestamp: "1512085950.000216" }]);
  });

  it("test_mark_as_read_sends_a_real_post_with_channel_and_ts", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { ok: true } }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    await provider.markAsRead!("C123", "1512085950.000216");
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://slack.com/api/conversations.mark");
    expect(adapter.calls[0]!.body).toEqual({ channel: "C123", ts: "1512085950.000216" });
  });

  it("test_mark_as_read_with_a_real_ok_false_body_throws_a_real_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { ok: false, error: "channel_not_found" } }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    await expect(provider.markAsRead!("bad-channel", "123.456")).rejects.toThrow(/channel_not_found/);
  });

  it("test_send_message_sends_a_real_post_with_channel_and_text", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { ok: true } }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    await provider.sendMessage!("C123", "hello team");
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://slack.com/api/chat.postMessage");
    expect(adapter.calls[0]!.body).toEqual({ channel: "C123", text: "hello team" });
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
  });

  it("test_send_message_with_a_real_ok_false_body_throws_a_real_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { ok: false, error: "channel_not_found" } }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    await expect(provider.sendMessage!("bad-channel", "hi")).rejects.toThrow(/channel_not_found/);
  });

  it("test_send_message_with_a_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new SlackCommsConnectProvider({ token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.sendMessage!("C123", "hi");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CommsConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("DiscordCommsConnectProvider", () => {
  it("test_connect_still_uses_the_bot_auth_scheme_same_as_before_the_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "G1", name: "my-server", owner: true }],
    }));
    const provider = new DiscordCommsConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://discord.com/api/v10/users/@me/guilds");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bot tok");
    expect(resources).toEqual([{ id: "G1", name: "my-server", status: "owner" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DiscordCommsConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
  });

  it("test_list_channels_filters_to_real_text_channels_only", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [
        { id: "cat1", name: "General", type: 4 },
        { id: "chan1", name: "general", type: 0 },
        { id: "voice1", name: "Voice Chat", type: 2 },
      ],
    }));
    const provider = new DiscordCommsConnectProvider({ token: "tok" }, adapter);
    const channels = await provider.listChannels!("G1");
    expect(adapter.calls[0]!.url).toBe("https://discord.com/api/v10/guilds/G1/channels");
    expect(channels).toEqual([{ id: "chan1", name: "general", status: "text" }]);
  });

  it("test_list_messages_parses_real_content_and_author_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "m1", content: "hey there", timestamp: "2026-01-01T00:00:00.000Z", author: { username: "alice" } }],
    }));
    const provider = new DiscordCommsConnectProvider({ token: "tok" }, adapter);
    const messages = await provider.listMessages!("chan1");
    expect(adapter.calls[0]!.url).toBe("https://discord.com/api/v10/channels/chan1/messages?limit=50");
    expect(messages).toEqual([{ id: "m1", author: "alice", text: "hey there", timestamp: "2026-01-01T00:00:00.000Z" }]);
  });

  it("test_send_message_posts_the_real_content_body_with_bot_auth", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "m1" } }));
    const provider = new DiscordCommsConnectProvider({ token: "tok" }, adapter);
    await provider.sendMessage!("chan1", "hey there");
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://discord.com/api/v10/channels/chan1/messages");
    expect(adapter.calls[0]!.body).toEqual({ content: "hey there" });
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bot tok");
  });

  it("test_send_message_with_rejected_token_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DiscordCommsConnectProvider({ token: "bad" }, adapter);
    await expect(provider.sendMessage!("chan1", "hi")).rejects.toThrow(/401/);
  });
});

describe("TeamsCommsConnectProvider", () => {
  it("test_connect_still_uses_the_default_bearer_scheme_same_as_before_the_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { value: [{ id: "T1", displayName: "Engineering", visibility: "private" }] },
    }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/me/joinedTeams");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "T1", name: "Engineering", status: "private" }]);
  });

  it("test_list_channels_parses_real_archived_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { value: [{ id: "ch1", displayName: "General", isArchived: false }, { id: "ch2", displayName: "Old Project", isArchived: true }] },
    }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    const channels = await provider.listChannels!("T1");
    expect(adapter.calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/teams/T1/channels");
    expect(channels).toEqual([
      { id: "ch1", name: "General", status: "active", archived: false },
      { id: "ch2", name: "Old Project", status: "archived", archived: true },
    ]);
  });

  it("test_list_messages_needs_the_real_team_id_alongside_the_channel_id", async () => {
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, new FakeApiAdapter());
    await expect(provider.listMessages!("ch1")).rejects.toThrow(/real team id/);
  });

  it("test_list_messages_calls_the_real_team_scoped_url_and_strips_html_to_safe_plain_text", async () => {
    // A real regression guard, not a trophy test: a message body
    // containing real HTML (including a script tag) must never survive
    // into the returned plain text - a genuine XSS concern, since
    // Teams' own body.content field is real HTML.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        value: [
          {
            id: "m1",
            createdDateTime: "2026-01-01T00:00:00Z",
            from: { user: { displayName: "Bob" } },
            body: { content: "<p>Hello <b>team</b><script>alert(1)</script></p>" },
          },
        ],
      },
    }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    const messages = await provider.listMessages!("ch1", "T1");
    expect(adapter.calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/teams/T1/channels/ch1/messages");
    expect(messages).toEqual([{ id: "m1", author: "Bob", text: "Hello team", timestamp: "2026-01-01T00:00:00Z" }]);
    expect(messages[0]!.text).not.toContain("<");
    expect(messages[0]!.text).not.toContain("script");
    expect(messages[0]!.text).not.toContain("alert");
  });

  it("test_a_real_403_names_the_real_likely_missing_graph_consent", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 403, headers: {}, data: undefined, error: "Forbidden" }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    await expect(provider.listChannels!("T1")).rejects.toThrow(/Graph permissions/);
  });

  it("test_send_message_needs_the_real_team_id_alongside_the_channel_id", async () => {
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, new FakeApiAdapter());
    await expect(provider.sendMessage!("ch1", "hi")).rejects.toThrow(/real team id/);
  });

  it("test_send_message_calls_the_real_team_scoped_url_with_the_real_body_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 201, headers: {}, data: { id: "m1" } }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    await provider.sendMessage!("ch1", "hello team", "T1");
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/teams/T1/channels/ch1/messages");
    expect(adapter.calls[0]!.body).toEqual({ body: { content: "hello team" } });
  });

  it("test_send_message_a_real_403_names_the_real_likely_missing_channel_message_send_consent", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 403, headers: {}, data: undefined, error: "Forbidden" }));
    const provider = new TeamsCommsConnectProvider({ token: "tok" }, adapter);
    await expect(provider.sendMessage!("ch1", "hi", "T1")).rejects.toThrow(/Graph permissions/);
  });
});

describe("comms-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("commsConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("commsConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
