import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { DefaultScmConnectProvider } from "../core/default_scm_connect_provider.js";
import { BitbucketScmConnectProvider } from "../core/bitbucket_provider.js";
import { GITHUB_PROVIDER } from "../spi/github.js";
import { GITLAB_PROVIDER } from "../spi/gitlab.js";
import { ScmConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["github", "gitlab", "bitbucket"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's and
// @justjs/cloud-connect's own test harnesses exactly - zero real network
// calls in this suite. Queues responses in call order (Bitbucket's
// provider makes two sequential calls per connect()).
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
    throw new Error("FakeApiAdapter.post() is not exercised by any scm-connect provider");
  }
  async put<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.put() is not exercised by any scm-connect provider");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any scm-connect provider");
  }
}

describe("DefaultScmConnectProvider", () => {
  it("test_connect_github_sends_bearer_token_and_parses_real_repo_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: 123, name: "justjs", full_name: "sweengineeringlabs/justjs", private: false }],
    }));
    const provider = new DefaultScmConnectProvider(GITHUB_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.github.com/user/repos");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(adapter.calls[0]!.options?.headers?.Accept).toBe("application/vnd.github+json");
    expect(resources).toEqual([{ id: "123", name: "sweengineeringlabs/justjs", status: "public" }]);
  });

  it("test_connect_gitlab_parses_real_project_shape_including_visibility", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: 456, path_with_namespace: "group/project", visibility: "private" }],
    }));
    const provider = new DefaultScmConnectProvider(GITLAB_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://gitlab.com/api/v4/projects?membership=true");
    expect(resources).toEqual([{ id: "456", name: "group/project", status: "private" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultScmConnectProvider(GITHUB_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
  });

  it("test_connect_with_a_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new DefaultScmConnectProvider(GITHUB_PROVIDER, { token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.connect();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ScmConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("BitbucketScmConnectProvider", () => {
  it("test_connect_lists_workspaces_then_the_first_workspaces_repos_in_that_order", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { values: [{ slug: "my-team", name: "My Team" }, { slug: "other-team", name: "Other Team" }] },
    }));
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { values: [{ uuid: "{repo-1}", name: "api", is_private: true }] },
    }));
    const provider = new BitbucketScmConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.bitbucket.org/2.0/workspaces");
    // Only the FIRST workspace's repos are fetched - a real, disclosed
    // limitation (Bitbucket has no cross-workspace list endpoint), not
    // every workspace the token can see.
    expect(adapter.calls[1]!.url).toBe("https://api.bitbucket.org/2.0/repositories/my-team");
    expect(resources).toEqual([{ id: "{repo-1}", name: "My Team/api", status: "private" }]);
  });

  it("test_connect_with_no_workspaces_returns_an_empty_list_without_a_second_call", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { values: [] } }));
    const provider = new BitbucketScmConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(resources).toEqual([]);
    expect(adapter.calls.length).toBe(1);
  });

  it("test_connect_with_rejected_token_throws_before_attempting_the_second_call", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new BitbucketScmConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
    expect(adapter.calls.length).toBe(1);
  });
});

describe("scm-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("scmConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("scmConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
