import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { AnthropicAiAssistProvider } from "../core/anthropic_provider.js";
import { AiAssistProviderError } from "../api/provider.js";

// Constructor-injected fake ApiAdapter, not a globalThis.fetch monkey-
// patch - cleaner than @justjs/network's own tests (which patch fetch
// directly) and matches this codebase's dependency-inversion rules.
// Every test below exercises AnthropicAiAssistProvider with zero real
// network calls.
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { url: string; body: unknown; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ url, body, options });
    const next = this.responses.shift();
    if (!next) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await next()) as ApiResponse<T>;
  }

  async get<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.get() is not exercised by AnthropicAiAssistProvider");
  }

  async put<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.put() is not exercised by AnthropicAiAssistProvider");
  }

  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by AnthropicAiAssistProvider");
  }
}

function textResponse(text: string): ApiResponse<unknown> {
  return { status: 200, headers: {}, data: { content: [{ type: "text", text }] } };
}

function anthropicErrorResponse(status: number, errorType: string, message: string, headers: Record<string, string> = {}): ApiResponse<unknown> {
  return {
    status,
    headers,
    error: `HTTP ${status}`,
    data: { type: "error", error: { type: errorType, message } },
  };
}

describe("AnthropicAiAssistProvider construction", () => {
  it("test_constructor_throws_when_apiKey_is_missing", () => {
    const fake = new FakeApiAdapter();
    expect(() => new AnthropicAiAssistProvider({ apiKey: "" }, fake)).toThrow(AiAssistProviderError);
  });
});

describe("AnthropicAiAssistProvider request shape", () => {
  it("test_every_request_sends_required_anthropic_headers", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("ok"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "sk-secret" }, fake);

    await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

    const headers = fake.calls[0]!.options!.headers!;
    expect(headers["x-api-key"]).toBe("sk-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("test_complete_sends_cursor_marked_prompt_to_the_fast_model_with_a_512_token_cap", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("const x = 1;"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.complete({
      codeBeforeCursor: "function foo() {\n  ",
      codeAfterCursor: "\n}",
      language: "javascript",
    });

    expect(result).toBe("const x = 1;");
    const body = fake.calls[0]!.body as { model: string; max_tokens: number; messages: Array<{ content: string }> };
    expect(body.model).toBe("claude-haiku-4-5");
    expect(body.max_tokens).toBe(512);
    expect(body.messages[0]!.content).toContain("function foo()");
    expect(body.messages[0]!.content).toContain("<CURSOR>");
  });

  it("test_chat_sends_current_buffer_as_system_context_and_the_full_message_history_to_the_capable_model", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("Looks fine."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.chat({
      code: "const x = 1;",
      language: "javascript",
      messages: [{ role: "user", content: "is this ok?" }],
    });

    expect(result).toBe("Looks fine.");
    const body = fake.calls[0]!.body as { model: string; system: string; messages: unknown[] };
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.system).toContain("const x = 1;");
    expect(body.messages).toEqual([{ role: "user", content: "is this ok?" }]);
  });

  it("test_scaffold_returns_generated_code_for_a_description", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("export function main() {}"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.scaffold({ description: "a hello world function", language: "typescript" });

    expect(result).toBe("export function main() {}");
  });
});

describe("AnthropicAiAssistProvider.review()", () => {
  it("test_review_forces_structured_tool_output_and_parses_the_returned_issues", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        content: [
          {
            type: "tool_use",
            name: "report_findings",
            input: { issues: [{ severity: "warning", message: "unused variable", line: 3 }] },
          },
        ],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const findings = await provider.review({ code: "let y = 2;", language: "javascript" });

    expect(findings).toEqual([{ severity: "warning", message: "unused variable", line: 3 }]);
    const body = fake.calls[0]!.body as { tool_choice: unknown; tools: Array<{ name: string }> };
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_findings" });
    expect(body.tools[0]!.name).toBe("report_findings");
  });

  it("test_review_throws_when_the_response_has_no_tool_use_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("I'd rather explain in prose."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.review({ code: "x" })).rejects.toThrow(AiAssistProviderError);
  });
});

describe("AnthropicAiAssistProvider.scaffoldProject()", () => {
  it("test_scaffold_project_forces_structured_tool_output_and_parses_the_returned_files", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        content: [
          {
            type: "tool_use",
            name: "report_project_files",
            input: {
              files: [
                { path: "src/index.js", content: "console.log('hi');" },
                { path: "README.md", content: "# demo" },
              ],
            },
          },
        ],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const files = await provider.scaffoldProject({ description: "a tiny hello-world project" });

    expect(files).toEqual([
      { path: "src/index.js", content: "console.log('hi');" },
      { path: "README.md", content: "# demo" },
    ]);
    const body = fake.calls[0]!.body as { max_tokens: number; tool_choice: unknown; tools: Array<{ name: string }> };
    expect(body.max_tokens).toBe(16000);
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_project_files" });
    expect(body.tools[0]!.name).toBe("report_project_files");
  });

  it("test_scaffold_project_throws_before_reading_a_truncated_response", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        stop_reason: "max_tokens",
        content: [{ type: "tool_use", name: "report_project_files", input: { files: [{ path: "a.js", content: "x" }] } }],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "a large project" })).rejects.toThrow(/cut off/);
  });

  it("test_scaffold_project_throws_when_the_response_has_no_tool_use_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("I'd rather explain in prose."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_project_throws_when_no_files_are_returned", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { content: [{ type: "tool_use", name: "report_project_files", input: { files: [] } }] },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_project_throws_on_a_file_with_a_missing_path", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { content: [{ type: "tool_use", name: "report_project_files", input: { files: [{ content: "x" }] } }] },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_project_throws_on_a_file_with_non_string_content", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { content: [{ type: "tool_use", name: "report_project_files", input: { files: [{ path: "a.js", content: 42 }] } }] },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_project_throws_on_a_duplicate_path_instead_of_silently_dropping_a_file", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        content: [
          {
            type: "tool_use",
            name: "report_project_files",
            input: {
              files: [
                { path: "a.js", content: "first" },
                { path: "a.js", content: "second" },
              ],
            },
          },
        ],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });
});

describe("AnthropicAiAssistProvider error handling", () => {
  it("test_anthropic_error_body_message_is_surfaced_over_the_generic_status_text", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => anthropicErrorResponse(401, "authentication_error", "invalid x-api-key"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "bad-key" }, fake);

    await expect(provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" })).rejects.toThrow("invalid x-api-key");
  });

  it("test_network_level_failure_is_wrapped_without_leaking_the_api_key", async () => {
    const fake = new FakeApiAdapter();
    fake.post = async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND");
    };
    const provider = new AnthropicAiAssistProvider({ apiKey: "sk-should-not-appear" }, fake);

    try {
      await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });
      throw new Error("expected complete() to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AiAssistProviderError);
      expect((e as Error).message).not.toContain("sk-should-not-appear");
      expect((e as Error).message).toContain("fetch failed");
    }
  });
});

describe("AnthropicAiAssistProvider retry-on-429", () => {
  it("test_a_429_response_retries_exactly_once_honoring_the_retry_after_header", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => anthropicErrorResponse(429, "rate_limit_error", "rate limited", { "retry-after": "0" }));
    fake.queueResponse(async () => textResponse("succeeded after retry"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

    expect(result).toBe("succeeded after retry");
    expect(fake.calls).toHaveLength(2);
  });

  it("test_a_non_429_error_status_does_not_retry", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => anthropicErrorResponse(500, "api_error", "server error"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" })).rejects.toThrow("server error");
    expect(fake.calls).toHaveLength(1);
  });
});

describe("ai-assist SPI self-registration", () => {
  it("test_anthropic_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    const resolved = justjs.providers.resolve("aiAssist", "anthropic");
    expect(resolved).not.toBeNull();
    expect(resolved!.concern).toBe("aiAssist");
    expect(resolved!.strategy).toBe("anthropic");
  });
});
