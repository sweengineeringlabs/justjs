import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { DefaultCommsConnectProvider } from "../core/default_comms_connect_provider.js";
import { SlackCommsConnectProvider } from "../core/slack_provider.js";
import { DISCORD_PROVIDER } from "../spi/discord.js";
import { TEAMS_PROVIDER } from "../spi/teams.js";
import { CommsConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["slack", "discord", "teams"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's/
// @justjs/cloud-connect's/@justjs/scm-connect's own test harnesses
// exactly - zero real network calls in this suite.
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { url: string; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ url, options });
    const next = this.responses.shift();
    if (!next) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await next()) as ApiResponse<T>;
  }

  async post<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.post() is not exercised by any comms-connect provider");
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

  it("test_connect_parses_real_channel_shape_including_privacy", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { ok: true, channels: [{ id: "C123", name: "general", is_private: false }] },
    }));
    const provider = new SlackCommsConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://slack.com/api/conversations.list");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "C123", name: "general", status: "public" }]);
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

describe("DefaultCommsConnectProvider", () => {
  it("test_connect_discord_uses_the_bot_auth_scheme_not_bearer", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "G1", name: "my-server", owner: true }],
    }));
    const provider = new DefaultCommsConnectProvider(DISCORD_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://discord.com/api/v10/users/@me/guilds");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bot tok");
    expect(resources).toEqual([{ id: "G1", name: "my-server", status: "owner" }]);
  });

  it("test_connect_teams_uses_the_default_bearer_scheme", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { value: [{ id: "T1", displayName: "Engineering", visibility: "private" }] },
    }));
    const provider = new DefaultCommsConnectProvider(TEAMS_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://graph.microsoft.com/v1.0/me/joinedTeams");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "T1", name: "Engineering", status: "private" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultCommsConnectProvider(DISCORD_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
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
