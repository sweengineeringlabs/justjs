import type { AspectTarget } from "@justjs/application";
import type { ApiAdapter, ApiResponse } from "@justjs/transport";
import type {
  AiAssistProvider,
  AiAssistProviderConfig,
  ChatMessage,
  ChatRequest,
  CompletionRequest,
  ImageAttachment,
  ReviewFinding,
  ReviewRequest,
  ScaffoldedFile,
  ScaffoldProjectRequest,
  ScaffoldRequest,
} from "../api/provider.js";
import { AiAssistProviderError } from "../api/provider.js";
import { withSingleRetryOn429 } from "./retry.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_COMPLETE_MODEL = "claude-haiku-4-5";
const DEFAULT_CAPABLE_MODEL = "claude-opus-4-8";

// Conservative per-capability caps - there's no streaming path anywhere
// in this codebase's network layer (@justjs/network's FetchAdapter fully
// buffers via `await res.text()`, no ReadableStream), so a long response
// is one uninterrupted blocking wait with no incremental display. These
// exist specifically because there's no streaming escape hatch if a
// response runs long.
const COMPLETE_MAX_TOKENS = 512;
const CHAT_MAX_TOKENS = 4096;
const REVIEW_MAX_TOKENS = 4096;
const SCAFFOLD_MAX_TOKENS = 4096;
// "A whole project"'s worth of file content plus JSON structural overhead
// for a multi-file tool call can plausibly exceed a single file's cap -
// bumped well above SCAFFOLD_MAX_TOKENS, but still bounded (no streaming
// escape hatch), and the prompt itself asks for a small, focused project
// on top of this cap rather than relying on the cap alone.
const SCAFFOLD_PROJECT_MAX_TOKENS = 16000;

const REVIEW_TOOL_NAME = "report_findings";
const PROJECT_TOOL_NAME = "report_project_files";

// Forced tool use, not free-text parsing - Anthropic's Messages API
// tool_choice:{type:"tool", name} mechanism guarantees the model responds
// with a tool_use block matching this JSON schema, rather than asking it
// to emit parseable prose and regexing the result.
const REVIEW_TOOL = {
  name: REVIEW_TOOL_NAME,
  description: "Report code review findings for the given source code.",
  input_schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["error", "warning", "info"] },
            message: { type: "string" },
            line: { type: "number" },
          },
          required: ["severity", "message"],
        },
      },
    },
    required: ["issues"],
  },
} as const;

const PROJECT_TOOL = {
  name: PROJECT_TOOL_NAME,
  description: "Report the generated files for a new project.",
  input_schema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    },
    required: ["files"],
  },
} as const;

interface AnthropicTextBlock {
  readonly type: "text";
  readonly text: string;
}

interface AnthropicToolUseBlock {
  readonly type: "tool_use";
  readonly name: string;
  readonly input: unknown;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { readonly type: string };

interface AnthropicMessageResponse {
  readonly content: AnthropicContentBlock[];
  // Not read by complete()/chat()/review()/scaffold() - those outputs
  // rarely hit their cap. scaffoldProject() is the first capability
  // where hitting max_tokens mid-generation is a likely outcome for a
  // nontrivial prompt, and its result can replace the user's entire
  // persisted project - a truncated tool-use payload silently accepted
  // there would be real data loss, not cosmetic.
  readonly stop_reason?: string;
}

interface AnthropicErrorBody {
  readonly type: string;
  readonly error: { readonly type: string; readonly message: string };
}

// Outbound content blocks - distinct from AnthropicContentBlock above,
// which models the response. Anthropic's Messages API accepts a
// message's `content` as either a plain string (the common case, used
// everywhere no image is attached) or an array of blocks when it needs
// to carry more than text.
interface OutboundTextBlock {
  readonly type: "text";
  readonly text: string;
}

interface OutboundImageBlock {
  readonly type: "image";
  readonly source: {
    readonly type: "base64";
    readonly media_type: string;
    readonly data: string;
  };
}

type AnthropicContent = string | Array<OutboundImageBlock | OutboundTextBlock>;

function isTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === "text";
}

function isToolUseBlock(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === "tool_use";
}

// Shared by every call site that sends a user message that might carry
// an image - toAnthropicMessage() (chat()'s real ChatMessage[] history)
// and review()/scaffoldProject()'s own ad hoc single-message bodies
// (neither builds a ChatMessage, so they route through this directly
// rather than through toAnthropicMessage()). Text-only stays a plain
// string - every existing text-only request keeps the exact same body
// shape it always has.
function toAnthropicContent(source: { content: string; image?: ImageAttachment }): AnthropicContent {
  if (!source.image) {
    return source.content;
  }
  return [
    {
      type: "image",
      source: { type: "base64", media_type: source.image.mediaType, data: source.image.base64Data },
    },
    // Image before text - Anthropic's documented ordering for best
    // results when a message mixes both.
    { type: "text", text: source.content },
  ];
}

function toAnthropicMessage(message: ChatMessage): { role: "user" | "assistant"; content: AnthropicContent } {
  return { role: message.role, content: toAnthropicContent(message) };
}

// Validated at this boundary, not left to the caller - unlike review()'s
// findings (where a malformed entry just renders oddly), a bad entry
// here becomes a persisted localStorage key once "Replace project"
// applies it. Rejects a non-array/empty response, any entry with a
// missing/empty path or non-string content, and duplicate paths (which
// a Record assignment would otherwise silently collapse, dropping a
// file with no error at all).
function validateScaffoldedFiles(files: unknown): ScaffoldedFile[] {
  if (!Array.isArray(files) || files.length === 0) {
    throw new AiAssistProviderError("EMPTY_PROJECT", "Anthropic returned no files for this project");
  }
  const seenPaths = new Set<string>();
  const validated: ScaffoldedFile[] = [];
  for (const entry of files) {
    const candidate = entry as Partial<ScaffoldedFile> | null;
    const path = candidate?.path;
    const content = candidate?.content;
    if (typeof path !== "string" || path.trim().length === 0) {
      throw new AiAssistProviderError("INVALID_PROJECT_FILE", "Anthropic returned a file with a missing or empty path");
    }
    if (typeof content !== "string") {
      throw new AiAssistProviderError("INVALID_PROJECT_FILE", `Anthropic returned non-string content for file "${path}"`);
    }
    if (seenPaths.has(path)) {
      throw new AiAssistProviderError("DUPLICATE_PROJECT_FILE", `Anthropic returned the file path "${path}" more than once`);
    }
    seenPaths.add(path);
    validated.push({ path, content });
  }
  return validated;
}

// The one shipped strategy for this package ("anthropic") - a real,
// working call to Claude via the Messages API, not a dummy/heuristic
// stand-in. Constructor-injected ApiAdapter so tests can supply a fake
// double instead of monkey-patching globalThis.fetch.
export class AnthropicAiAssistProvider implements AiAssistProvider {
  readonly concern = "aiAssist" as const;
  readonly strategy = "anthropic" as const;

  private readonly apiKey: string;
  private readonly completeModel: string;
  private readonly capableModel: string;

  constructor(
    config: AiAssistProviderConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    if (!config.apiKey) {
      throw new AiAssistProviderError("MISSING_API_KEY", "AiAssistProviderConfig.apiKey is required");
    }
    this.apiKey = config.apiKey;
    this.completeModel = config.completeModel ?? DEFAULT_COMPLETE_MODEL;
    this.capableModel = config.capableModel ?? DEFAULT_CAPABLE_MODEL;
  }

  // Real no-op - see the comment on AiAssistProvider.weave() in
  // api/provider.ts for why this method must exist at all.
  weave(_target: AspectTarget): void {}

  async complete(req: CompletionRequest): Promise<string> {
    const prompt =
      `Continue the following${req.language ? ` ${req.language}` : ""} code at the <CURSOR> marker. ` +
      `Return ONLY the code to insert at the cursor - no explanation, no markdown fences.\n\n` +
      `${req.codeBeforeCursor}<CURSOR>${req.codeAfterCursor}`;
    const response = await this.send({
      model: this.completeModel,
      max_tokens: COMPLETE_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    return this.firstText(response);
  }

  async chat(req: ChatRequest): Promise<string> {
    const system =
      `You are a helpful coding assistant embedded in a code editor. ` +
      `The user's current buffer${req.language ? ` (${req.language})` : ""} is:\n\n${req.code}`;
    const response = await this.send({
      model: this.capableModel,
      max_tokens: CHAT_MAX_TOKENS,
      system,
      messages: req.messages.map(toAnthropicMessage),
    });
    return this.firstText(response);
  }

  async review(req: ReviewRequest): Promise<ReviewFinding[]> {
    const prompt =
      `Review the following${req.language ? ` ${req.language}` : ""} code for bugs, correctness ` +
      `issues, and style problems. Call ${REVIEW_TOOL_NAME} with your findings - an empty issues ` +
      `array if you find nothing worth flagging.\n\n${req.code}`;
    const content = toAnthropicContent({ content: prompt, ...(req.image !== undefined ? { image: req.image } : {}) });
    const response = await this.send({
      model: this.capableModel,
      max_tokens: REVIEW_MAX_TOKENS,
      messages: [{ role: "user", content }],
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: REVIEW_TOOL_NAME },
    });
    const toolUse = response.content.find(isToolUseBlock);
    if (!toolUse) {
      throw new AiAssistProviderError(
        "NO_STRUCTURED_OUTPUT",
        "Anthropic response contained no tool_use block for review findings"
      );
    }
    const input = toolUse.input as { issues?: ReviewFinding[] };
    return input.issues ?? [];
  }

  async scaffold(req: ScaffoldRequest): Promise<string> {
    const prompt =
      `Generate a new${req.language ? ` ${req.language}` : ""} file from this description. ` +
      `Return ONLY the code - no explanation, no markdown fences.\n\n${req.description}`;
    const response = await this.send({
      model: this.capableModel,
      max_tokens: SCAFFOLD_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    return this.firstText(response);
  }

  async scaffoldProject(req: ScaffoldProjectRequest): Promise<ScaffoldedFile[]> {
    const prompt =
      `Generate a small, focused project from this description - at most ~6 files, skip build ` +
      `config or test scaffolding unless asked. Call ${PROJECT_TOOL_NAME} with the generated ` +
      `files, each with a relative path (e.g. "src/index.js") and its full content.\n\n${req.description}`;
    const content = toAnthropicContent({ content: prompt, ...(req.image !== undefined ? { image: req.image } : {}) });
    const response = await this.send({
      model: this.capableModel,
      max_tokens: SCAFFOLD_PROJECT_MAX_TOKENS,
      messages: [{ role: "user", content }],
      tools: [PROJECT_TOOL],
      tool_choice: { type: "tool", name: PROJECT_TOOL_NAME },
    });
    // Checked before ever touching toolUse.input - a truncated tool-use
    // payload accepted here would silently become a corrupted project
    // once "Replace project" persists it.
    if (response.stop_reason === "max_tokens") {
      throw new AiAssistProviderError(
        "TRUNCATED_OUTPUT",
        "Anthropic's response was cut off before finishing - try a smaller or more specific project description"
      );
    }
    const toolUse = response.content.find(isToolUseBlock);
    if (!toolUse) {
      throw new AiAssistProviderError(
        "NO_STRUCTURED_OUTPUT",
        "Anthropic response contained no tool_use block for the generated project"
      );
    }
    const input = toolUse.input as { files?: unknown };
    return validateScaffoldedFiles(input.files);
  }

  private firstText(response: AnthropicMessageResponse): string {
    return response.content.find(isTextBlock)?.text ?? "";
  }

  private async send(body: Record<string, unknown>): Promise<AnthropicMessageResponse> {
    const response = await withSingleRetryOn429(() => this.postToAnthropic(body));
    if (response.error !== undefined) {
      throw this.toError(response);
    }
    return response.data as AnthropicMessageResponse;
  }

  private async postToAnthropic(body: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    try {
      return await this.apiAdapter.post(ANTHROPIC_MESSAGES_URL, body, {
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
          "anthropic-dangerous-direct-browser-access": "true",
        },
      });
    } catch (error) {
      // TransportError path (network-level failure, no HTTP response at
      // all). Only the URL and the underlying error message are ever
      // referenced here - never `body` or the request object itself,
      // which carries the x-api-key header.
      throw new AiAssistProviderError(
        "NETWORK_ERROR",
        `Request to ${ANTHROPIC_MESSAGES_URL} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Anthropic HTTP-level failures (4xx/5xx) come back as a normal
  // ApiResponse with `.data` holding the parsed JSON error body, not as a
  // thrown TransportError - `response.error` is only DefaultApiAdapter's
  // generic status text, `response.data.error.message` is Anthropic's
  // real reason. Only status/body referenced here, never the request -
  // see postToAnthropic's comment on the same rule.
  private toError(response: ApiResponse<unknown>): AiAssistProviderError {
    const body = response.data as Partial<AnthropicErrorBody> | undefined;
    const message = body?.error?.message ?? response.error ?? `HTTP ${response.status}`;
    return new AiAssistProviderError(body?.error?.type ?? `HTTP_${response.status}`, message);
  }
}
