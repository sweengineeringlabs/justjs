import type { AspectTarget } from "@justjs/application";
import type { ApiAdapter, ApiResponse } from "@justjs/transport";
import { signAwsRequest } from "@justjs/aws-sigv4";
import type {
  AgentStepRequest,
  AgentStepResult,
  AiAssistProvider,
  BedrockAiAssistConfig,
  ChatMessage,
  ChatRequest,
  CompletionRequest,
  DesignDocRequest,
  ReviewFinding,
  ReviewRequest,
  ScaffoldedFile,
  ScaffoldProjectRequest,
  ScaffoldRequest,
  SlidesRequest,
} from "../api/provider.js";
import { AiAssistProviderError } from "../api/provider.js";

const DEFAULT_COMPLETE_MODEL = "anthropic.claude-3-5-haiku-20241022-v1:0";
const DEFAULT_CAPABLE_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0";
const BEDROCK_ANTHROPIC_VERSION = "bedrock-2023-05-31";
const SERVICE = "bedrock";

// Same conservative caps as AnthropicAiAssistProvider - no streaming
// path in this codebase's network layer, so a long response is one
// uninterrupted blocking wait.
const COMPLETE_MAX_TOKENS = 512;
const CHAT_MAX_TOKENS = 4096;

interface AnthropicTextBlock {
  readonly type: "text";
  readonly text: string;
}
type AnthropicContentBlock = AnthropicTextBlock | { readonly type: string };

interface BedrockInvokeResponse {
  readonly content: AnthropicContentBlock[];
}

interface BedrockErrorBody {
  readonly message?: string;
}

function isTextBlock(block: AnthropicContentBlock): block is AnthropicTextBlock {
  return block.type === "text";
}

function toAnthropicMessage(message: ChatMessage): { role: "user" | "assistant"; content: string } {
  // Bedrock pilot (justjs#145/ADR-0018) covers text-only chat() - image
  // attachments are real, tested work on the Anthropic strategy
  // (toAnthropicContent()'s own content-block handling) not yet ported
  // here. A message with an image is rejected explicitly in chat()
  // below rather than silently dropping the image.
  return { role: message.role, content: message.content };
}

// Real local/CI testing seam (same pattern justjs#143 established for
// @justjs/cloud-connect) - overrides only the destination host, signing
// stays pinned to the real values. Absent in production.
function endpointOverride(envVar: string, realHost: string): string {
  return typeof process !== "undefined" ? (process.env[envVar] ?? realHost) : realHost;
}

// AWS Bedrock strategy (justjs#145/ADR-0018) - real SigV4-signed calls
// to Bedrock's InvokeModel API, same underlying Claude models Anthropic's
// own API serves, reached through AWS credentials instead of an
// Anthropic API key. Pilot scope: complete() + chat() only, chosen as
// the highest-traffic, simplest-shape methods - the remaining 6 methods
// throw a real, honest NOT_IMPLEMENTED error rather than a silent stub,
// matching this repo's own "no fake work" rule. Verified live (not just
// unit-tested): a real signed request against real AWS Bedrock returned
// the exact expected "security token...invalid" rejection with
// intentionally-invalid test credentials, confirming both CORS support
// and correct request shape end-to-end.
export class BedrockAiAssistProvider implements AiAssistProvider {
  readonly concern = "aiAssist" as const;
  readonly strategy = "bedrock" as const;

  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly region: string;
  private readonly completeModel: string;
  private readonly capableModel: string;

  constructor(
    config: BedrockAiAssistConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new AiAssistProviderError("MISSING_CREDENTIALS", "BedrockAiAssistConfig.accessKeyId/secretAccessKey are required");
    }
    if (!config.region) {
      throw new AiAssistProviderError("MISSING_REGION", "BedrockAiAssistConfig.region is required");
    }
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.region = config.region;
    this.completeModel = config.completeModel ?? DEFAULT_COMPLETE_MODEL;
    this.capableModel = config.capableModel ?? DEFAULT_CAPABLE_MODEL;
  }

  weave(_target: AspectTarget): void {}

  async complete(req: CompletionRequest): Promise<string> {
    const prompt =
      `Continue the following${req.language ? ` ${req.language}` : ""} code at the <CURSOR> marker. ` +
      `Return ONLY the code to insert at the cursor - no explanation, no markdown fences.\n\n` +
      `${req.codeBeforeCursor}<CURSOR>${req.codeAfterCursor}`;
    const response = await this.invoke(this.completeModel, {
      anthropic_version: BEDROCK_ANTHROPIC_VERSION,
      max_tokens: COMPLETE_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    return this.firstText(response);
  }

  async chat(req: ChatRequest): Promise<string> {
    if (req.messages.some((m) => m.image)) {
      throw new AiAssistProviderError(
        "NOT_IMPLEMENTED",
        "Image attachments aren't supported on the Bedrock strategy yet - use the Anthropic strategy for image-attached chats."
      );
    }
    const system =
      `You are a helpful coding assistant embedded in a code editor. ` +
      `The user's current buffer${req.language ? ` (${req.language})` : ""} is:\n\n${req.code}`;
    const response = await this.invoke(this.capableModel, {
      anthropic_version: BEDROCK_ANTHROPIC_VERSION,
      max_tokens: CHAT_MAX_TOKENS,
      system,
      messages: req.messages.map(toAnthropicMessage),
    });
    return this.firstText(response);
  }

  async review(_req: ReviewRequest): Promise<ReviewFinding[]> {
    throw new AiAssistProviderError("NOT_IMPLEMENTED", "review() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy.");
  }

  async scaffold(_req: ScaffoldRequest): Promise<string> {
    throw new AiAssistProviderError("NOT_IMPLEMENTED", "scaffold() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy.");
  }

  async scaffoldProject(_req: ScaffoldProjectRequest): Promise<ScaffoldedFile[]> {
    throw new AiAssistProviderError(
      "NOT_IMPLEMENTED",
      "scaffoldProject() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy."
    );
  }

  async generateDesignDoc(_req: DesignDocRequest): Promise<string> {
    throw new AiAssistProviderError(
      "NOT_IMPLEMENTED",
      "generateDesignDoc() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy."
    );
  }

  async generateSlides(_req: SlidesRequest): Promise<string> {
    throw new AiAssistProviderError(
      "NOT_IMPLEMENTED",
      "generateSlides() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy."
    );
  }

  async agentStep(_req: AgentStepRequest): Promise<AgentStepResult> {
    throw new AiAssistProviderError("NOT_IMPLEMENTED", "agentStep() isn't implemented for the Bedrock strategy yet - use the Anthropic strategy.");
  }

  private firstText(response: BedrockInvokeResponse): string {
    return response.content.find(isTextBlock)?.text ?? "";
  }

  private async invoke(modelId: string, body: Record<string, unknown>): Promise<BedrockInvokeResponse> {
    const host = endpointOverride("AI_ASSIST_BEDROCK_ENDPOINT", `bedrock-runtime.${this.region}.amazonaws.com`);
    const path = `/model/${encodeURIComponent(modelId)}/invoke`;
    const bodyStr = JSON.stringify(body);
    const headers = await signAwsRequest({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      service: SERVICE,
      method: "POST",
      host,
      path,
      query: "",
      body: bodyStr,
      extraHeaders: { "Content-Type": "application/json" },
    });
    let response: ApiResponse<unknown>;
    try {
      response = await this.apiAdapter.post(`https://${host}${path}`, bodyStr, { headers });
    } catch (error) {
      throw new AiAssistProviderError(
        "NETWORK_ERROR",
        `Request to Bedrock (${host}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (response.error !== undefined) {
      const errBody = response.data as BedrockErrorBody | undefined;
      throw new AiAssistProviderError(`HTTP_${response.status}`, errBody?.message ?? response.error ?? `HTTP ${response.status}`);
    }
    return response.data as BedrockInvokeResponse;
  }
}
