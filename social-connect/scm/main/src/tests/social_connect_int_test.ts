import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { DefaultSocialConnectProvider } from "../core/default_social_connect_provider.js";
import { BlueskySocialConnectProvider } from "../core/bluesky_provider.js";
import { RedditSocialConnectProvider } from "../core/reddit_provider.js";
import { MASTODON_PROVIDER } from "../spi/mastodon.js";
import { SocialConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["mastodon", "bluesky", "reddit"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's/
// @justjs/cloud-connect's/@justjs/scm-connect's/@justjs/comms-connect's
// own test harnesses - zero real network calls in this suite. Unlike
// those, this one also queues real post() calls (Bluesky's
// createSession, Reddit's token exchange both need it), tracking method
// alongside url/options so the 2-call-sequencing tests below can assert
// call order and shape.
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
    throw new Error("FakeApiAdapter.put() is not exercised by any social-connect provider");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any social-connect provider");
  }
}

describe("DefaultSocialConnectProvider (Mastodon)", () => {
  it("test_connect_parses_real_list_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "1", title: "Friends", replies_policy: "followed" }],
    }));
    const provider = new DefaultSocialConnectProvider(MASTODON_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://mastodon.social/api/v1/lists");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "1", name: "Friends", status: "followed" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultSocialConnectProvider(MASTODON_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
  });
});

describe("BlueskySocialConnectProvider", () => {
  it("test_connect_does_a_real_2_call_sequence_session_then_follows", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { did: "did:plc:abc123", handle: "alice.bsky.social", accessJwt: "jwt-token" },
    }));
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { follows: [{ did: "did:plc:xyz789", handle: "bob.bsky.social", displayName: "Bob" }] },
    }));
    const provider = new BlueskySocialConnectProvider({ identifier: "alice.bsky.social", appPassword: "app-pass" }, adapter);
    const resources = await provider.connect();

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");
    expect(adapter.calls[0]!.body).toEqual({ identifier: "alice.bsky.social", password: "app-pass" });

    expect(adapter.calls[1]!.method).toBe("get");
    expect(adapter.calls[1]!.url).toBe("https://bsky.social/xrpc/app.bsky.graph.getFollows?actor=did%3Aplc%3Aabc123");
    expect(adapter.calls[1]!.options?.headers?.Authorization).toBe("Bearer jwt-token");

    expect(resources).toEqual([{ id: "did:plc:xyz789", name: "Bob", status: "bob.bsky.social" }]);
  });

  it("test_connect_with_a_real_authenticationrequired_body_throws_a_real_actionable_error", async () => {
    // The real error shape confirmed live against Bluesky's own API for
    // bad credentials - a naive HTTP-status-only check would still catch
    // this (Bluesky's createSession does return 401), but the message
    // must surface Bluesky's own real reason, not a generic one.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 401,
      headers: {},
      data: { error: "AuthenticationRequired", message: "Invalid identifier or password" },
      error: "Unauthorized",
    }));
    const provider = new BlueskySocialConnectProvider({ identifier: "alice.bsky.social", appPassword: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/Invalid identifier or password/);
  });

  it("test_connect_with_a_network_failure_throws_without_leaking_the_app_password", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new BlueskySocialConnectProvider({ identifier: "alice.bsky.social", appPassword: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.connect();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SocialConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("RedditSocialConnectProvider", () => {
  it("test_connect_sends_a_real_http_basic_auth_header_for_the_token_exchange", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { access_token: "app-token" },
    }));
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { data: { children: [{ data: { id: "abc", title: "A real post", subreddit_name_prefixed: "r/popular" } }] } },
    }));
    const provider = new RedditSocialConnectProvider({ clientId: "id123", clientSecret: "secret456" }, adapter);
    const resources = await provider.connect();

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://www.reddit.com/api/v1/access_token");
    expect(adapter.calls[0]!.body).toBe("grant_type=client_credentials");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe(`Basic ${btoa("id123:secret456")}`);
    expect(adapter.calls[0]!.options?.headers?.["content-type"]).toBe("application/x-www-form-urlencoded");

    expect(adapter.calls[1]!.method).toBe("get");
    expect(adapter.calls[1]!.url).toBe("https://oauth.reddit.com/r/popular/hot?limit=10");
    expect(adapter.calls[1]!.options?.headers?.Authorization).toBe("Bearer app-token");

    expect(resources).toEqual([{ id: "abc", name: "A real post", status: "r/popular" }]);
  });

  it("test_connect_with_rejected_client_credentials_throws_a_real_actionable_error", async () => {
    // The real shape confirmed live against Reddit's own token endpoint
    // for a fake client id/secret pair.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 401,
      headers: {},
      data: { message: "Unauthorized", error: 401 },
      error: "Unauthorized",
    }));
    const provider = new RedditSocialConnectProvider({ clientId: "bad", clientSecret: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/rejected \(401\)/);
  });
});

describe("social-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("socialConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("socialConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
