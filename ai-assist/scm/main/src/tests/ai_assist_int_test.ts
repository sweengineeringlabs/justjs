import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";
import { AnthropicAiAssistProvider } from "../core/anthropic_provider.js";
import { BedrockAiAssistProvider } from "../core/bedrock_provider.js";
import { AiAssistProviderError } from "../api/provider.js";
import { createAiAssistProvider } from "../saf/index.js";

// justjs#148's own in-browser endpoint-override seam reads
// globalThis.localStorage - genuinely absent from plain `bun test`
// (confirmed: `bun -e "localStorage"` throws ReferenceError). A minimal
// real Map-backed Storage implementation, not a mock of this package's
// own logic - only of a Web API this Node-based test runner doesn't
// otherwise have (no happy-dom dependency here, unlike @justjs/cloud-connect's
// own test suite, which already needed it for DOMParser - not worth
// adding a whole new devDependency just for this).
class FakeLocalStorage {
  private readonly store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}
(globalThis as { localStorage?: unknown }).localStorage = new FakeLocalStorage();

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

// Bedrock's real error shape (confirmed live against real AWS Bedrock,
// see bedrock_provider.ts's own header comment) is a flat
// { message } - no nested error.type like Anthropic's direct API.
function bedrockErrorResponse(status: number, message: string): ApiResponse<unknown> {
  return { status, headers: {}, error: `HTTP ${status}`, data: { message } };
}

const FAKE_BEDROCK_CREDENTIALS = { accessKeyId: "AKIAFAKE", secretAccessKey: "secret", region: "us-east-1" };

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

  it("test_chat_sends_image_and_text_as_content_blocks_when_an_image_is_attached", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("That's a syntax error on line 2."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await provider.chat({
      code: "const x = 1",
      messages: [
        {
          role: "user",
          content: "what's wrong here?",
          image: { mediaType: "image/png", base64Data: "ZmFrZS1wbmctYnl0ZXM=" },
        },
      ],
    });

    const body = fake.calls[0]!.body as { messages: Array<{ content: unknown }> };
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: "ZmFrZS1wbmctYnl0ZXM=" } },
          { type: "text", text: "what's wrong here?" },
        ],
      },
    ]);
  });

  it("test_scaffold_returns_generated_code_for_a_description", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("export function main() {}"));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.scaffold({ description: "a hello world function", language: "typescript" });

    expect(result).toBe("export function main() {}");
  });

  it("test_generate_design_doc_returns_the_full_markdown_document_and_asks_for_a_mermaid_fence", async () => {
    const fake = new FakeApiAdapter();
    const doc = "# Auth flow\n\n```mermaid\nsequenceDiagram\n  A->>B: login\n```\n";
    fake.queueResponse(async () => textResponse(doc));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.generateDesignDoc({ description: "a login sequence" });

    expect(result).toBe(doc);
    const body = fake.calls[0]!.body as { model: string; max_tokens: number; messages: Array<{ content: string }> };
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(4096);
    expect(body.messages[0]!.content).toContain("```mermaid");
    expect(body.messages[0]!.content).toContain("a login sequence");
  });

  it("test_generate_slides_returns_the_full_deck_and_asks_for_bare_triple_dash_slide_breaks", async () => {
    const fake = new FakeApiAdapter();
    const deck = "# Intro\n\n- point one\n\n---\n\n# Next\n\n- point two\n";
    fake.queueResponse(async () => textResponse(deck));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.generateSlides({ description: "a product pitch" });

    expect(result).toBe(deck);
    const body = fake.calls[0]!.body as { model: string; max_tokens: number; messages: Array<{ content: string }> };
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(4096);
    expect(body.messages[0]!.content).toContain("exactly ---");
    expect(body.messages[0]!.content).toContain("a product pitch");
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

  it("test_review_includes_the_attached_image_as_a_content_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { content: [{ type: "tool_use", name: "report_findings", input: { issues: [] } }] },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await provider.review({
      code: "let y = 2;",
      image: { mediaType: "image/jpeg", base64Data: "ZmFrZS1qcGVnLWJ5dGVz" },
    });

    const body = fake.calls[0]!.body as { messages: Array<{ content: unknown }> };
    const content = body.messages[0]!.content as Array<{ type: string; source?: unknown }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "ZmFrZS1qcGVnLWJ5dGVz" } });
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

  it("test_scaffold_project_includes_the_attached_image_as_a_content_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        content: [
          { type: "tool_use", name: "report_project_files", input: { files: [{ path: "index.html", content: "<html></html>" }] } },
        ],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await provider.scaffoldProject({
      description: "recreate this UI",
      image: { mediaType: "image/webp", base64Data: "ZmFrZS13ZWJwLWJ5dGVz" },
    });

    const body = fake.calls[0]!.body as { messages: Array<{ content: unknown }> };
    const content = body.messages[0]!.content as Array<{ type: string; source?: unknown }>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/webp", data: "ZmFrZS13ZWJwLWJ5dGVz" } });
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

describe("AnthropicAiAssistProvider.agentStep()", () => {
  const READ_FILE_TOOL = { name: "read_file", description: "Read a file.", inputSchema: { type: "object", properties: { path: { type: "string" } } } };

  it("test_agentStep_sends_tools_with_tool_choice_auto_and_disable_parallel_tool_use", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("Here's what I found."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await provider.agentStep({
      code: "const x = 1;",
      tools: [READ_FILE_TOOL],
      messages: [{ role: "user", content: "read main.js" }],
    });

    const body = fake.calls[0]!.body as { tool_choice: unknown; tools: Array<{ name: string; input_schema: unknown }> };
    expect(body.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
    expect(body.tools).toEqual([{ name: "read_file", description: "Read a file.", input_schema: READ_FILE_TOOL.inputSchema }]);
  });

  it("test_agentStep_returns_tool_call_kind_with_id_name_input_when_response_has_a_tool_use_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        content: [
          { type: "text", text: "I'll read that file first." },
          { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "main.js" } },
        ],
      },
    }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.agentStep({
      code: "",
      tools: [READ_FILE_TOOL],
      messages: [{ role: "user", content: "read main.js" }],
    });

    expect(result).toEqual({
      kind: "tool_call",
      text: "I'll read that file first.",
      toolCall: { id: "toolu_1", name: "read_file", input: { path: "main.js" } },
    });
  });

  it("test_agentStep_returns_text_kind_when_response_has_no_tool_use_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("All done, no changes needed."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.agentStep({ code: "", tools: [READ_FILE_TOOL], messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual({ kind: "text", text: "All done, no changes needed." });
  });

  it("test_agentStep_returns_max_tokens_kind_and_does_not_throw", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({ status: 200, headers: {}, data: { stop_reason: "max_tokens", content: [{ type: "text", text: "cut off" }] } }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const result = await provider.agentStep({ code: "", tools: [], messages: [{ role: "user", content: "hi" }] });

    expect(result).toEqual({ kind: "max_tokens" });
  });

  it("test_agentStep_throws_AiAssistProviderError_on_refusal_stop_reason", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({ status: 200, headers: {}, data: { stop_reason: "refusal", content: [] } }));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    await expect(provider.agentStep({ code: "", tools: [], messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      AiAssistProviderError
    );
  });

  it("test_agentStep_a_tool_result_message_serializes_as_a_user_role_tool_result_content_block", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { content: [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "main.js" } }] },
    }));
    fake.queueResponse(async () => textResponse("main.js contains a single console.log."));
    const provider = new AnthropicAiAssistProvider({ apiKey: "k" }, fake);

    const first = await provider.agentStep({ code: "", tools: [READ_FILE_TOOL], messages: [{ role: "user", content: "read main.js" }] });
    expect(first.kind).toBe("tool_call");
    const toolCall = (first as { toolCall: { id: string; name: string; input: unknown } }).toolCall;

    await provider.agentStep({
      code: "",
      tools: [READ_FILE_TOOL],
      messages: [
        { role: "user", content: "read main.js" },
        { role: "assistant", content: "", toolUse: toolCall },
        { role: "tool_result", toolUseId: toolCall.id, content: "console.log('hi');", isError: false },
      ],
    });

    const secondBody = fake.calls[1]!.body as { messages: Array<{ role: string; content: unknown }> };
    expect(secondBody.messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "console.log('hi');", is_error: false }],
    });
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

describe("BedrockAiAssistProvider construction", () => {
  it("test_constructor_throws_when_credentials_are_missing", () => {
    const fake = new FakeApiAdapter();
    expect(() => new BedrockAiAssistProvider({ accessKeyId: "", secretAccessKey: "", region: "us-east-1" }, fake)).toThrow(
      AiAssistProviderError
    );
  });

  it("test_constructor_throws_when_region_is_missing", () => {
    const fake = new FakeApiAdapter();
    expect(() => new BedrockAiAssistProvider({ accessKeyId: "AKIAFAKE", secretAccessKey: "secret", region: "" }, fake)).toThrow(
      AiAssistProviderError
    );
  });
});

describe("BedrockAiAssistProvider request shape", () => {
  it("test_complete_signs_the_request_and_targets_the_default_fast_model_in_the_url_path", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("const x = 1;"));
    const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

    const result = await provider.complete({ codeBeforeCursor: "function foo() {\n  ", codeAfterCursor: "\n}" });

    expect(result).toBe("const x = 1;");
    const call = fake.calls[0]!;
    expect(call.url).toBe("https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-haiku-20241022-v1%3A0/invoke");
    const headers = call.options!.headers!;
    expect(headers["Authorization"]).toContain("AWS4-HMAC-SHA256 Credential=AKIAFAKE/");
    expect(headers["Host"]).toBe("bedrock-runtime.us-east-1.amazonaws.com");
    expect(headers["X-Amz-Date"]).toMatch(/^\d{8}T\d{6}Z$/);

    const body = JSON.parse(call.body as string) as {
      anthropic_version: string;
      max_tokens: number;
      model?: string;
      messages: Array<{ content: string }>;
    };
    expect(body.anthropic_version).toBe("bedrock-2023-05-31");
    expect(body.max_tokens).toBe(512);
    expect(body.model).toBeUndefined();
    expect(body.messages[0]!.content).toContain("function foo()");
    expect(body.messages[0]!.content).toContain("<CURSOR>");
  });

  it("test_chat_sends_system_context_and_targets_the_default_capable_model", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("Looks fine."));
    const provider = new BedrockAiAssistProvider({ ...FAKE_BEDROCK_CREDENTIALS, region: "eu-west-1" }, fake);

    const result = await provider.chat({ code: "const x = 1;", messages: [{ role: "user", content: "is this ok?" }] });

    expect(result).toBe("Looks fine.");
    expect(fake.calls[0]!.url).toContain("anthropic.claude-3-5-sonnet-20241022-v2%3A0");
    const body = JSON.parse(fake.calls[0]!.body as string) as { system: string; max_tokens: number; messages: unknown[] };
    expect(body.system).toContain("const x = 1;");
    expect(body.max_tokens).toBe(4096);
    expect(body.messages).toEqual([{ role: "user", content: "is this ok?" }]);
  });

  it("test_chat_rejects_an_image_attached_message_without_making_a_request", async () => {
    const fake = new FakeApiAdapter();
    const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

    await expect(
      provider.chat({
        code: "",
        messages: [{ role: "user", content: "what's wrong?", image: { mediaType: "image/png", base64Data: "ZmFrZQ==" } }],
      })
    ).rejects.toThrow(AiAssistProviderError);
    expect(fake.calls).toHaveLength(0);
  });

  it("test_custom_model_id_and_region_override_the_defaults", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("ok"));
    const provider = new BedrockAiAssistProvider(
      { accessKeyId: "AKIAFAKE", secretAccessKey: "secret", region: "ap-southeast-2", completeModel: "custom.model-v1" },
      fake
    );

    await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

    expect(fake.calls[0]!.url).toBe("https://bedrock-runtime.ap-southeast-2.amazonaws.com/model/custom.model-v1/invoke");
  });
});

describe("BedrockAiAssistProvider unimplemented methods", () => {
  const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, new FakeApiAdapter());

  it("test_review_throws_not_implemented", async () => {
    await expect(provider.review({ code: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_throws_not_implemented", async () => {
    await expect(provider.scaffold({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_scaffold_project_throws_not_implemented", async () => {
    await expect(provider.scaffoldProject({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_generate_design_doc_throws_not_implemented", async () => {
    await expect(provider.generateDesignDoc({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_generate_slides_throws_not_implemented", async () => {
    await expect(provider.generateSlides({ description: "x" })).rejects.toThrow(AiAssistProviderError);
  });

  it("test_agent_step_throws_not_implemented", async () => {
    await expect(provider.agentStep({ code: "", tools: [], messages: [] })).rejects.toThrow(AiAssistProviderError);
  });
});

describe("BedrockAiAssistProvider error handling", () => {
  it("test_bedrock_error_body_message_is_surfaced_over_the_generic_status_text", async () => {
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => bedrockErrorResponse(403, "The security token included in the request is invalid."));
    const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

    await expect(provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" })).rejects.toThrow(
      "The security token included in the request is invalid."
    );
  });

  it("test_network_level_failure_is_wrapped_without_leaking_the_secret_key", async () => {
    const fake = new FakeApiAdapter();
    fake.post = async () => {
      throw new Error("fetch failed: getaddrinfo ENOTFOUND");
    };
    const provider = new BedrockAiAssistProvider({ ...FAKE_BEDROCK_CREDENTIALS, secretAccessKey: "sk-should-not-appear" }, fake);

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

describe("BedrockAiAssistProvider endpoint override (justjs#148)", () => {
  it("test_redirects_to_the_localStorage_override_when_set_and_no_env_var_present", async () => {
    delete process.env["AI_ASSIST_BEDROCK_ENDPOINT"];
    globalThis.localStorage.setItem("justjs:aws-endpoint-override:AI_ASSIST_BEDROCK_ENDPOINT", "localhost:4566");
    try {
      const fake = new FakeApiAdapter();
      fake.queueResponse(async () => textResponse("ok"));
      const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

      await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

      expect(fake.calls[0]!.url).toContain("localhost:4566");
    } finally {
      globalThis.localStorage.removeItem("justjs:aws-endpoint-override:AI_ASSIST_BEDROCK_ENDPOINT");
    }
  });

  it("test_env_var_override_takes_precedence_over_localStorage_override_when_both_are_set", async () => {
    process.env["AI_ASSIST_BEDROCK_ENDPOINT"] = "localhost:9001";
    globalThis.localStorage.setItem("justjs:aws-endpoint-override:AI_ASSIST_BEDROCK_ENDPOINT", "localhost:9002");
    try {
      const fake = new FakeApiAdapter();
      fake.queueResponse(async () => textResponse("ok"));
      const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

      await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

      expect(fake.calls[0]!.url).toContain("localhost:9001");
    } finally {
      delete process.env["AI_ASSIST_BEDROCK_ENDPOINT"];
      globalThis.localStorage.removeItem("justjs:aws-endpoint-override:AI_ASSIST_BEDROCK_ENDPOINT");
    }
  });

  it("test_no_override_present_at_all_still_hits_the_real_production_bedrock_host", async () => {
    delete process.env["AI_ASSIST_BEDROCK_ENDPOINT"];
    globalThis.localStorage.removeItem("justjs:aws-endpoint-override:AI_ASSIST_BEDROCK_ENDPOINT");
    const fake = new FakeApiAdapter();
    fake.queueResponse(async () => textResponse("ok"));
    const provider = new BedrockAiAssistProvider(FAKE_BEDROCK_CREDENTIALS, fake);

    await provider.complete({ codeBeforeCursor: "", codeAfterCursor: "" });

    expect(fake.calls[0]!.url).toContain("bedrock-runtime.us-east-1.amazonaws.com");
  });
});

describe("createAiAssistProvider (SAF factory)", () => {
  it("test_resolves_the_anthropic_strategy_through_the_spi_registry", () => {
    const provider = createAiAssistProvider("anthropic", { apiKey: "k" });
    expect(provider.strategy).toBe("anthropic");
  });

  it("test_resolves_the_bedrock_strategy_through_the_spi_registry", () => {
    const provider = createAiAssistProvider("bedrock", FAKE_BEDROCK_CREDENTIALS);
    expect(provider.strategy).toBe("bedrock");
  });

  it("test_throws_a_descriptive_error_for_an_unknown_strategy", () => {
    expect(() => createAiAssistProvider("does-not-exist", { apiKey: "k" })).toThrow(AiAssistProviderError);
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

  it("test_bedrock_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    const resolved = justjs.providers.resolve("aiAssist", "bedrock");
    expect(resolved).not.toBeNull();
    expect(resolved!.concern).toBe("aiAssist");
    expect(resolved!.strategy).toBe("bedrock");
  });
});
