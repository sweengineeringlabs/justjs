import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { DefaultSocialConnectProvider } from "../core/default_social_connect_provider.js";
import { BlueskySocialConnectProvider } from "../core/bluesky_provider.js";
import { RedditSocialConnectProvider } from "../core/reddit_provider.js";
import { TestSocialConnectProvider } from "../core/test_social_provider.js";
import { TestDashboardAnalyticsProvider } from "../core/test_dashboard_analytics_provider.js";
import { MASTODON_PROVIDER } from "../spi/mastodon.js";
import { SocialConnectProviderError } from "../api/provider.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

const ALL_STRATEGIES = ["mastodon", "bluesky", "reddit", "testsocial"];
const ALL_DASHBOARD_ANALYTICS_STRATEGIES = ["testsocial"];

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

  it("test_create_post_sends_the_real_status_field_to_the_real_statuses_endpoint", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "1" } }));
    const provider = new DefaultSocialConnectProvider(MASTODON_PROVIDER, { token: "tok" }, adapter);
    await provider.createPost!("hello world");
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://mastodon.social/api/v1/statuses");
    expect(adapter.calls[0]!.body).toEqual({ status: "hello world" });
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
  });

  it("test_create_post_with_rejected_token_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultSocialConnectProvider(MASTODON_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.createPost!("hi")).rejects.toThrow(/token rejected \(401\)/);
  });

  it("test_create_post_is_unsupported_for_a_descriptor_without_a_postUrl", async () => {
    const adapter = new FakeApiAdapter();
    const readOnlyDescriptor = { ...MASTODON_PROVIDER, postUrl: undefined, buildPostBody: undefined };
    const provider = new DefaultSocialConnectProvider(readOnlyDescriptor, { token: "tok" }, adapter);
    await expect(provider.createPost!("hi")).rejects.toThrow(/not supported/);
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

  it("test_create_post_does_a_real_2_call_sequence_session_then_create_record", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { did: "did:plc:abc123", handle: "alice.bsky.social", accessJwt: "jwt-token" },
    }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { uri: "at://did:plc:abc123/app.bsky.feed.post/1" } }));
    const provider = new BlueskySocialConnectProvider({ identifier: "alice.bsky.social", appPassword: "app-pass" }, adapter);
    await provider.createPost!("hello world");

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://bsky.social/xrpc/com.atproto.server.createSession");

    expect(adapter.calls[1]!.method).toBe("post");
    expect(adapter.calls[1]!.url).toBe("https://bsky.social/xrpc/com.atproto.repo.createRecord");
    expect(adapter.calls[1]!.options?.headers?.Authorization).toBe("Bearer jwt-token");
    const body = adapter.calls[1]!.body as { repo: string; collection: string; record: { text: string } };
    expect(body.repo).toBe("did:plc:abc123");
    expect(body.collection).toBe("app.bsky.feed.post");
    expect(body.record.text).toBe("hello world");
  });

  it("test_create_post_with_a_real_failed_create_record_body_throws_a_real_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { did: "did:plc:abc123", handle: "alice.bsky.social", accessJwt: "jwt-token" },
    }));
    adapter.queueResponse(async () => ({
      status: 400,
      headers: {},
      data: { error: "InvalidRequest", message: "text too long" },
      error: "Bad Request",
    }));
    const provider = new BlueskySocialConnectProvider({ identifier: "alice.bsky.social", appPassword: "app-pass" }, adapter);
    await expect(provider.createPost!("x".repeat(1000))).rejects.toThrow(/text too long/);
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

  it("test_reddit_does_not_implement_create_post_client_credentials_cannot_post_as_a_user", () => {
    // Real, structural exclusion, not an oversight - Reddit's stored
    // credential here is an app-only client_credentials grant, which
    // cannot post as a user (see api/provider.ts's createPost comment).
    const provider = new RedditSocialConnectProvider({ clientId: "id", clientSecret: "secret" }, new FakeApiAdapter());
    expect(provider.createPost).toBeUndefined();
  });
});

describe("TestSocialConnectProvider", () => {
  it("test_connect_with_no_token_throws_a_real_actionable_error", async () => {
    const provider = new TestSocialConnectProvider({ token: "" });
    await expect(provider.connect()).rejects.toThrow(/paste any value/);
  });

  it("test_connect_with_a_real_token_returns_canned_resources_without_any_network_call", async () => {
    const provider = new TestSocialConnectProvider({ token: "ok" });
    const resources = await provider.connect();
    expect(resources.length).toBeGreaterThan(0);
    expect(resources.every((r) => typeof r.id === "string" && typeof r.name === "string")).toBe(true);
  });

  it("test_connect_with_a_token_containing_fail_simulates_a_real_rejected_call", async () => {
    const provider = new TestSocialConnectProvider({ token: "please-fail-here" });
    await expect(provider.connect()).rejects.toThrow(SocialConnectProviderError);
    await expect(provider.connect()).rejects.toThrow(/simulated failure/);
  });

  it("test_create_post_with_a_real_token_resolves_without_throwing", async () => {
    const provider = new TestSocialConnectProvider({ token: "ok" });
    await expect(provider.createPost!("hello")).resolves.toBeUndefined();
  });

  it("test_create_post_with_a_token_containing_fail_simulates_a_real_posting_failure", async () => {
    const provider = new TestSocialConnectProvider({ token: "fail" });
    await expect(provider.createPost!("hello")).rejects.toThrow(/simulated posting failure/);
  });
});

describe("TestDashboardAnalyticsProvider", () => {
  it("test_fetch_analytics_with_no_token_returns_canned_metrics_trending_and_activity", async () => {
    const provider = new TestDashboardAnalyticsProvider({});
    const snapshot = await provider.fetchAnalytics();
    expect(snapshot.metrics.length).toBeGreaterThan(0);
    expect(snapshot.metrics.every((m) => typeof m.label === "string" && typeof m.count === "number")).toBe(true);
    expect(snapshot.trending.length).toBeGreaterThan(0);
    expect(snapshot.recentActivity.length).toBeGreaterThan(0);
  });

  it("test_each_metrics_item_count_matches_its_own_items_length", async () => {
    const provider = new TestDashboardAnalyticsProvider({});
    const snapshot = await provider.fetchAnalytics();
    for (const metric of snapshot.metrics) {
      expect(metric.items.length).toBe(metric.count);
    }
  });

  it("test_fetch_analytics_with_a_token_containing_fail_simulates_a_real_rejected_call", async () => {
    const provider = new TestDashboardAnalyticsProvider({ token: "please-fail" });
    await expect(provider.fetchAnalytics()).rejects.toThrow(DashboardAnalyticsProviderError);
    await expect(provider.fetchAnalytics()).rejects.toThrow(/simulated failure/);
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

  it("test_every_dashboard_analytics_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_DASHBOARD_ANALYTICS_STRATEGIES) {
      const resolved = justjs.providers.resolve("dashboardAnalytics", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("dashboardAnalytics");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
