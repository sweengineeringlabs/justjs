import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { LinearPmConnectProvider } from "../core/linear_provider.js";
import { AsanaPmConnectProvider } from "../core/asana_provider.js";
import { TrelloPmConnectProvider } from "../core/trello_provider.js";
import { JiraPmConnectProvider } from "../core/jira_provider.js";
import { buildJiraAuthorizationUrl, exchangeJiraAuthorizationCode } from "../core/jira_oauth.js";
import { PmConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["linear", "asana", "trello", "jira"];

// Constructor-injected fake ApiAdapter, matching every sibling
// *-connect package's own test harness exactly - zero real network
// calls in this suite. Also queues real post() calls (Linear's GraphQL
// POST, Jira's token exchange both need it).
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
    throw new Error("FakeApiAdapter.put() is not exercised by any pm-connect provider");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any pm-connect provider");
  }
}

describe("LinearPmConnectProvider", () => {
  it("test_connect_sends_the_token_with_no_bearer_prefix_and_parses_assigned_issues", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { data: { viewer: { assignedIssues: { nodes: [{ id: "i1", title: "Fix bug", state: { name: "In Progress" } }] } } } },
    }));
    const provider = new LinearPmConnectProvider({ token: "lin_api_tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://api.linear.app/graphql");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("lin_api_tok");
    expect(resources).toEqual([{ id: "i1", name: "Fix bug", status: "In Progress" }]);
  });

  it("test_connect_with_a_real_200_but_graphql_errors_array_throws_a_real_error", async () => {
    // A naive HTTP-status-only check would miss this - GraphQL APIs
    // (Linear included) can answer 200 with a populated errors array.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { errors: [{ message: "Authentication required", extensions: { type: "authentication_error" } }] },
    }));
    const provider = new LinearPmConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/Authentication required/);
  });
});

describe("AsanaPmConnectProvider", () => {
  it("test_connect_does_a_real_2_call_sequence_workspace_then_tasks_with_opt_fields", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { data: [{ gid: "w1", name: "My Workspace" }] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { data: [{ gid: "t1", name: "Write docs", completed: false }] } }));
    const provider = new AsanaPmConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();

    expect(adapter.calls[0]!.url).toBe("https://app.asana.com/api/1.0/workspaces");
    expect(adapter.calls[1]!.url).toBe("https://app.asana.com/api/1.0/tasks?assignee=me&workspace=w1&opt_fields=name,completed");
    expect(resources).toEqual([{ id: "t1", name: "Write docs", status: "incomplete" }]);
  });

  it("test_connect_with_no_workspaces_returns_an_empty_list_without_a_second_call", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { data: [] } }));
    const provider = new AsanaPmConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(resources).toEqual([]);
    expect(adapter.calls.length).toBe(1);
  });
});

describe("TrelloPmConnectProvider", () => {
  it("test_connect_sends_key_and_token_as_real_query_params_not_a_header", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [{ id: "b1", name: "Roadmap", closed: false }] }));
    const provider = new TrelloPmConnectProvider({ apiKey: "key123", token: "tok456" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.trello.com/1/members/me/boards?key=key123&token=tok456&fields=id,name,closed");
    expect(adapter.calls[0]!.options?.headers).toBeUndefined();
    expect(resources).toEqual([{ id: "b1", name: "Roadmap", status: "open" }]);
  });

  it("test_connect_with_a_real_plain_text_401_body_surfaces_the_real_reason", async () => {
    // Trello's own docs confirm 401 bodies are plain text ("invalid
    // token"/"invalid key"), not JSON - a naive JSON-error-shape
    // assumption would silently lose this real reason.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: "invalid token", error: "Unauthorized" }));
    const provider = new TrelloPmConnectProvider({ apiKey: "key", token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/invalid token/);
  });
});

describe("JiraPmConnectProvider", () => {
  it("test_connect_uses_the_real_non_deprecated_search_jql_endpoint_and_parses_issues", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { issues: [{ id: "10001", key: "PROJ-1", fields: { summary: "Fix login", status: { name: "To Do" } } }] },
    }));
    const provider = new JiraPmConnectProvider({ accessToken: "tok", cloudId: "cloud-1" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toContain("/ex/jira/cloud-1/rest/api/3/search/jql");
    expect(adapter.calls[0]!.url).not.toContain("/rest/api/3/search?");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "10001", name: "PROJ-1: Fix login", status: "To Do" }]);
  });

  it("test_connect_with_an_expired_session_names_the_real_reason", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new JiraPmConnectProvider({ accessToken: "expired", cloudId: "cloud-1" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/short-lived/);
  });
});

describe("buildJiraAuthorizationUrl", () => {
  it("test_builds_the_real_atlassian_authorization_url_with_all_required_params", () => {
    const url = buildJiraAuthorizationUrl({ clientId: "client-1", redirectUri: "http://localhost:3201/", state: "state-abc" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://auth.atlassian.com/authorize");
    expect(parsed.searchParams.get("audience")).toBe("api.atlassian.com");
    expect(parsed.searchParams.get("client_id")).toBe("client-1");
    expect(parsed.searchParams.get("scope")).toBe("read:jira-work");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3201/");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("prompt")).toBe("consent");
  });
});

describe("exchangeJiraAuthorizationCode", () => {
  it("test_does_the_real_2_call_sequence_token_exchange_then_accessible_resources", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { access_token: "real-access-token" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [{ id: "cloud-xyz", url: "https://my-site.atlassian.net" }] }));

    const session = await exchangeJiraAuthorizationCode(
      { clientId: "client-1", clientSecret: "secret-1", code: "auth-code", redirectUri: "http://localhost:3201/" },
      adapter
    );

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://auth.atlassian.com/oauth/token");
    expect(adapter.calls[0]!.body).toEqual({
      grant_type: "authorization_code",
      client_id: "client-1",
      client_secret: "secret-1",
      code: "auth-code",
      redirect_uri: "http://localhost:3201/",
    });
    expect(adapter.calls[1]!.url).toBe("https://api.atlassian.com/oauth/token/accessible-resources");
    expect(adapter.calls[1]!.options?.headers?.Authorization).toBe("Bearer real-access-token");
    expect(session).toEqual({ accessToken: "real-access-token", cloudId: "cloud-xyz", siteUrl: "https://my-site.atlassian.net" });
  });

  it("test_with_no_accessible_sites_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { access_token: "tok" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [] }));
    await expect(
      exchangeJiraAuthorizationCode({ clientId: "c", clientSecret: "s", code: "code", redirectUri: "http://x/" }, adapter)
    ).rejects.toThrow(/no accessible Jira Cloud site/);
  });

  it("test_with_a_network_failure_throws_without_leaking_the_client_secret", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    let caught: unknown;
    try {
      await exchangeJiraAuthorizationCode({ clientId: "c", clientSecret: "super-secret", code: "code", redirectUri: "http://x/" }, adapter);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PmConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("pm-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("pmConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("pmConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
