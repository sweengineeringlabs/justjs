import type { ApiAdapter } from "@justjs/transport";
import type { ImageConnectProvider, GeneratedImage, BearerTokenConfig } from "../api/provider.js";
import { ImageConnectProviderError } from "../api/provider.js";

// A real prompt prefix, not a structured API parameter - OpenAI's
// images API has no literal "style" field (confirmed via research),
// so cartoon styling here is real prompt engineering, disclosed as
// such by the app layer rather than presented as equivalent to
// Stability's real style_preset field.
const CARTOON_PROMPT_PREFIX = "A cartoon-style illustration of: ";

// dall-e-3 was retired from the API 2026-05-12 (confirmed) - gpt-image-1.5
// is the current real, non-deprecated flagship model.
const IMAGE_MODEL = "gpt-image-1.5";

interface OpenAiModelsResponse {
  readonly object: string;
  readonly data: ReadonlyArray<{ readonly id: string }>;
}

interface OpenAiImageResponse {
  readonly data: ReadonlyArray<{ readonly b64_json: string }>;
}

interface OpenAiErrorResponse {
  readonly error?: { readonly message: string };
}

// OpenAI - real distinct logic: connect() calls the real, free
// GET /v1/models (never a real billed generation call) just to prove
// the key works. generate() always returns base64 - OpenAI's
// `response_format` param is no longer honored by gpt-image models
// (confirmed live/via docs, the older url-based response format was
// dall-e-only and dall-e is now dead).
export class OpenAiImageConnectProvider implements ImageConnectProvider {
  readonly concern = "imageConnect" as const;
  readonly strategy = "openai";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<string> {
    let response;
    try {
      response = await this.apiAdapter.get<OpenAiModelsResponse>("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "OpenAI: network request failed - check your connection (no backend proxy, this calls api.openai.com directly)."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as OpenAiErrorResponse | undefined, response.error);
    }
    return "API key verified";
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    let response;
    try {
      response = await this.apiAdapter.post<OpenAiImageResponse>(
        "https://api.openai.com/v1/images/generations",
        { model: IMAGE_MODEL, prompt: `${CARTOON_PROMPT_PREFIX}${prompt}`, size: "1024x1024", n: 1 },
        { headers: { Authorization: `Bearer ${this.config.token}` } }
      );
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "OpenAI: network request failed while generating - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as OpenAiErrorResponse | undefined, response.error);
    }
    const [image] = response.data.data;
    if (!image) {
      throw new ImageConnectProviderError("NO_IMAGE_RETURNED", "OpenAI: the response contained no image data.");
    }
    return { base64: image.b64_json, mimeType: "image/png" };
  }

  private toError(status: number, body: OpenAiErrorResponse | undefined, error: string): ImageConnectProviderError {
    if (status === 401) {
      return new ImageConnectProviderError("TOKEN_REJECTED", `OpenAI: key rejected (${body?.error?.message ?? "invalid API key"}).`);
    }
    return new ImageConnectProviderError("REQUEST_FAILED", `OpenAI: request failed (${status} ${body?.error?.message ?? error}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's ImageConnectProvider.weave() comment.
  }
}
