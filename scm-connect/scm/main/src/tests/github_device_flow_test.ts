import { describe, it, expect } from "bun:test";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { requestGithubDeviceCode, pollGithubDeviceToken } from "../core/github_device_flow.js";
import { ScmConnectProviderError } from "../api/provider.js";

// Constructor-injected fake ApiAdapter, matching this package's own
// scm_connect_int_test.ts pattern - but post()-driven, since the device
// flow's two real HTTP calls (request a device code, poll for a token)
// are both POSTs, unlike every other provider in this package.
class FakePostApiAdapter implements ApiAdapter {
  readonly calls: { url: string; body: unknown; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ url, body, options });
    const next = this.responses.shift();
    if (!next) {
      throw new Error("FakePostApiAdapter: no queued response for this call");
    }
    return (await next()) as ApiResponse<T>;
  }

  async get<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakePostApiAdapter.get() is not exercised by the device flow");
  }
  async put<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakePostApiAdapter.put() is not exercised by the device flow");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakePostApiAdapter.delete() is not exercised by the device flow");
  }
}

function okResponse(data: unknown): ApiResponse<unknown> {
  return { status: 200, headers: {}, data };
}

const SESSION = {
  deviceCode: "device-123",
  userCode: "ABCD-1234",
  verificationUri: "https://github.com/login/device",
  expiresIn: 900,
  interval: 5,
};

// No real setTimeout waits in any test below - a no-op sleepFn makes the
// poll loop's timing irrelevant to the test's actual behavior.
const NO_WAIT = async (): Promise<void> => {};

describe("requestGithubDeviceCode", () => {
  it("test_requestGithubDeviceCode_sends_client_id_and_scope_and_maps_the_response", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () =>
      okResponse({
        device_code: "device-123",
        user_code: "ABCD-1234",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      })
    );

    const session = await requestGithubDeviceCode({ clientId: "client-abc" }, adapter);

    expect(adapter.calls[0]!.url).toBe("https://github.com/login/device/code");
    expect(adapter.calls[0]!.body).toEqual({ client_id: "client-abc", scope: "repo" });
    expect(session).toEqual(SESSION);
  });

  it("test_requestGithubDeviceCode_honors_a_custom_scope", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () =>
      okResponse({ device_code: "d", user_code: "u", verification_uri: "v", expires_in: 1, interval: 1 })
    );

    await requestGithubDeviceCode({ clientId: "client-abc", scope: "repo read:user" }, adapter);

    expect(adapter.calls[0]!.body).toEqual({ client_id: "client-abc", scope: "repo read:user" });
  });

  it("test_requestGithubDeviceCode_throws_on_a_non_ok_response", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => ({ status: 400, headers: {}, data: undefined, error: "Bad Request" }));

    await expect(requestGithubDeviceCode({ clientId: "client-abc" }, adapter)).rejects.toThrow(ScmConnectProviderError);
  });

  it("test_requestGithubDeviceCode_wraps_a_network_failure", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });

    await expect(requestGithubDeviceCode({ clientId: "client-abc" }, adapter)).rejects.toThrow(ScmConnectProviderError);
  });
});

describe("pollGithubDeviceToken", () => {
  it("test_pollGithubDeviceToken_returns_the_access_token_on_success", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ access_token: "gho_real_token", token_type: "bearer", scope: "repo" }));

    const token = await pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT);

    expect(token).toBe("gho_real_token");
    expect(adapter.calls[0]!.url).toBe("https://github.com/login/oauth/access_token");
    expect(adapter.calls[0]!.body).toEqual({
      client_id: "client-abc",
      device_code: "device-123",
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
  });

  it("test_pollGithubDeviceToken_keeps_polling_through_authorization_pending", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ error: "authorization_pending" }));
    adapter.queueResponse(async () => okResponse({ error: "authorization_pending" }));
    adapter.queueResponse(async () => okResponse({ access_token: "gho_after_two_pending", token_type: "bearer", scope: "repo" }));

    const token = await pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT);

    expect(token).toBe("gho_after_two_pending");
    expect(adapter.calls.length).toBe(3);
  });

  it("test_pollGithubDeviceToken_increases_the_interval_on_slow_down_and_keeps_polling", async () => {
    const adapter = new FakePostApiAdapter();
    const sleepCalls: number[] = [];
    const recordingSleep = async (ms: number): Promise<void> => {
      sleepCalls.push(ms);
    };
    adapter.queueResponse(async () => okResponse({ error: "slow_down" }));
    adapter.queueResponse(async () => okResponse({ access_token: "gho_after_slow_down", token_type: "bearer", scope: "repo" }));

    const token = await pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, recordingSleep);

    expect(token).toBe("gho_after_slow_down");
    // First sleep uses the session's own interval (5s); the second poll's
    // sleep must reflect GitHub's own required +5s bump after slow_down.
    expect(sleepCalls).toEqual([5000, 10000]);
  });

  it("test_pollGithubDeviceToken_throws_a_real_error_on_expired_token", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ error: "expired_token" }));

    await expect(pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT)).rejects.toThrow(/expired/);
  });

  it("test_pollGithubDeviceToken_throws_a_real_error_on_access_denied", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ error: "access_denied" }));

    await expect(pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT)).rejects.toThrow(/cancelled or denied/);
  });

  it("test_pollGithubDeviceToken_throws_on_an_unrecognized_error_code_instead_of_retrying_forever", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ error: "device_flow_disabled" }));

    await expect(pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT)).rejects.toThrow(/device_flow_disabled/);
    expect(adapter.calls.length).toBe(1);
  });

  it("test_pollGithubDeviceToken_stops_scheduling_further_polls_once_aborted", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => okResponse({ error: "authorization_pending" }));
    const controller = new AbortController();
    controller.abort();

    await expect(pollGithubDeviceToken("client-abc", SESSION, adapter, controller.signal, NO_WAIT)).rejects.toThrow(
      ScmConnectProviderError
    );
    expect(adapter.calls.length).toBe(0);
  });

  it("test_pollGithubDeviceToken_wraps_a_network_failure_mid_poll", async () => {
    const adapter = new FakePostApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });

    await expect(pollGithubDeviceToken("client-abc", SESSION, adapter, undefined, NO_WAIT)).rejects.toThrow(ScmConnectProviderError);
  });
});
