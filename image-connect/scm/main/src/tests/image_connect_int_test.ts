import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { OpenAiImageConnectProvider } from "../core/openai_provider.js";
import { StabilityImageConnectProvider } from "../core/stability_provider.js";
import { GeminiImageConnectProvider } from "../core/gemini_provider.js";
import { ImageConnectProviderError } from "../api/provider.js";

const ALL_STRATEGIES = ["openai", "stability", "gemini"];

// Constructor-injected fake ApiAdapter, matching every sibling
// *-connect package's own test harness exactly - zero real network
// calls in this suite, and critically no real billed generation call
// ever happens here either.
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
    throw new Error("FakeApiAdapter.put() is not exercised by any image-connect provider");
  }
  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any image-connect provider");
  }
}

describe("OpenAiImageConnectProvider", () => {
  it("test_connect_calls_the_real_free_models_endpoint_not_a_billed_call", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { object: "list", data: [{ id: "gpt-image-1.5" }] } }));
    const provider = new OpenAiImageConnectProvider({ token: "tok" }, adapter);
    const status = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.openai.com/v1/models");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(status).toBe("API key verified");
  });

  it("test_connect_with_a_real_401_names_the_real_error_message", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: { error: { message: "Incorrect API key provided" } }, error: "Unauthorized" }));
    const provider = new OpenAiImageConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/Incorrect API key provided/);
  });

  it("test_generate_prefixes_the_prompt_with_real_cartoon_styling_and_uses_the_real_non_deprecated_model", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { data: [{ b64_json: "ZmFrZS1wbmctYnl0ZXM=" }] } }));
    const provider = new OpenAiImageConnectProvider({ token: "tok" }, adapter);
    const image = await provider.generate("a red bicycle");
    expect(adapter.calls[0]!.url).toBe("https://api.openai.com/v1/images/generations");
    const body = adapter.calls[0]!.body as { model: string; prompt: string };
    expect(body.model).toBe("gpt-image-1.5");
    expect(body.prompt).toBe("A cartoon-style illustration of: a red bicycle");
    expect(image).toEqual({ base64: "ZmFrZS1wbmctYnl0ZXM=", mimeType: "image/png" });
  });

  it("test_generate_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new OpenAiImageConnectProvider({ token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.generate("anything");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ImageConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });
});

describe("StabilityImageConnectProvider", () => {
  it("test_connect_calls_the_real_free_balance_endpoint_and_returns_the_real_credit_count", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { credits: 24.5 } }));
    const provider = new StabilityImageConnectProvider({ token: "tok" }, adapter);
    const status = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.stability.ai/v1/user/balance");
    expect(status).toBe("24.5 credits available");
  });

  it("test_generate_sends_a_real_multipart_form_data_body_with_the_real_style_preset_field", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { image: "ZmFrZS1wbmctYnl0ZXM=", finish_reason: "SUCCESS" } }));
    const provider = new StabilityImageConnectProvider({ token: "tok" }, adapter);
    const image = await provider.generate("a red bicycle");
    expect(adapter.calls[0]!.url).toBe("https://api.stability.ai/v2beta/stable-image/generate/core");
    const body = adapter.calls[0]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("prompt")).toBe("a red bicycle");
    expect(body.get("style_preset")).toBe("comic-book");
    expect(adapter.calls[0]!.options?.headers?.Accept).toBe("application/json");
    expect(image).toEqual({ base64: "ZmFrZS1wbmctYnl0ZXM=", mimeType: "image/png" });
  });

  it("test_generate_with_a_real_non_success_finish_reason_throws_a_real_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { image: "", finish_reason: "CONTENT_FILTERED" } }));
    const provider = new StabilityImageConnectProvider({ token: "tok" }, adapter);
    await expect(provider.generate("anything")).rejects.toThrow(/CONTENT_FILTERED/);
  });

  it("test_connect_with_a_real_401_names_the_real_message", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: { name: "unauthorized", message: "missing authorization header" }, error: "Unauthorized" }));
    const provider = new StabilityImageConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/missing authorization header/);
  });
});

describe("GeminiImageConnectProvider", () => {
  it("test_connect_sends_the_real_key_as_a_query_param_not_a_header", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { models: [{ name: "models/gemini-2.5-flash-image" }] } }));
    const provider = new GeminiImageConnectProvider({ token: "tok" }, adapter);
    const status = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?key=tok");
    expect(adapter.calls[0]!.options?.headers).toBeUndefined();
    expect(status).toBe("API key verified");
  });

  it("test_generate_uses_the_real_pinned_stable_model_and_parses_real_inline_data", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "ZmFrZS1wbmctYnl0ZXM=" } }] } }] },
    }));
    const provider = new GeminiImageConnectProvider({ token: "tok" }, adapter);
    const image = await provider.generate("a red bicycle");
    expect(adapter.calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=tok");
    const body = adapter.calls[0]!.body as { contents: Array<{ parts: Array<{ text: string }> }>; generationConfig: { responseModalities: string[] } };
    expect(body.contents[0]!.parts[0]!.text).toBe("A cartoon-style illustration of: a red bicycle");
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(image).toEqual({ base64: "ZmFrZS1wbmctYnl0ZXM=", mimeType: "image/png" });
  });

  it("test_connect_with_a_real_400_api_key_error_is_recognized_as_a_token_rejection_not_a_generic_401_assumption", async () => {
    // Real, confirmed-live shape: Gemini answers an invalid key with a
    // 400, not a 401 - a naive "401 means bad token" assumption
    // (correct for OpenAI/Stability) would misclassify this one.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 400,
      headers: {},
      data: { error: { message: "API key not valid. Please pass a valid API key." } },
      error: "Bad Request",
    }));
    const provider = new GeminiImageConnectProvider({ token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/API key not valid/);
  });

  it("test_generate_with_no_image_part_in_the_response_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { candidates: [{ content: { parts: [{ text: "sorry, I can't do that" }] } }] } }));
    const provider = new GeminiImageConnectProvider({ token: "tok" }, adapter);
    await expect(provider.generate("anything")).rejects.toThrow(/no image data/);
  });
});

describe("image-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("imageConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("imageConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
