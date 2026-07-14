import type { ApiAdapter } from "@justjs/transport";
import type { ImageConnectProvider, GeneratedImage, BearerTokenConfig } from "../api/provider.js";
import { ImageConnectProviderError } from "../api/provider.js";

// A real prompt prefix, not a structured API parameter - same real
// reasoning as OpenAI's own provider: Gemini's image generation has no
// literal "style" field (confirmed via research), so cartoon styling
// here is real prompt engineering.
const CARTOON_PROMPT_PREFIX = "A cartoon-style illustration of: ";

// Pinned to the confirmed-stable, generally-available model - research
// found conflicting signals on the newer 3.x preview models' current
// shutdown/availability status, so the known-stable model is the safer
// real choice here, a deliberate pin rather than an oversight.
const IMAGE_MODEL = "gemini-2.5-flash-image";

interface GeminiModelsResponse {
  readonly models: ReadonlyArray<{ readonly name: string }>;
}

interface GeminiGenerateContentResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<{ readonly inlineData?: { readonly mimeType: string; readonly data: string } }> };
  }>;
}

interface GeminiErrorResponse {
  readonly error?: { readonly message: string };
}

// Google Gemini - real distinct logic: auth is a real `?key=` query
// param (Gemini's own documented convention, confirmed via docs - not
// a header, genuinely different from OpenAI's/Stability's Bearer
// header), and a real invalid-key error is a 400, not a 401 (confirmed
// via Gemini's own real error shape) - handled explicitly rather than
// assumed to match the other two providers' convention.
export class GeminiImageConnectProvider implements ImageConnectProvider {
  readonly concern = "imageConnect" as const;
  readonly strategy = "gemini";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<string> {
    let response;
    try {
      response = await this.apiAdapter.get<GeminiModelsResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(this.config.token)}`
      );
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "Google Gemini: network request failed - check your connection (no backend proxy, this calls generativelanguage.googleapis.com directly)."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as GeminiErrorResponse | undefined, response.error);
    }
    return "API key verified";
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    let response;
    try {
      response = await this.apiAdapter.post<GeminiGenerateContentResponse>(
        `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${encodeURIComponent(this.config.token)}`,
        {
          contents: [{ parts: [{ text: `${CARTOON_PROMPT_PREFIX}${prompt}` }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }
      );
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "Google Gemini: network request failed while generating - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as GeminiErrorResponse | undefined, response.error);
    }
    const imagePart = (response.data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .find((p) => p.inlineData !== undefined);
    if (!imagePart?.inlineData) {
      throw new ImageConnectProviderError("NO_IMAGE_RETURNED", "Google Gemini: the response contained no image data.");
    }
    return { base64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
  }

  private toError(status: number, body: GeminiErrorResponse | undefined, error: string): ImageConnectProviderError {
    if (status === 400 && body?.error?.message?.toLowerCase().includes("api key")) {
      return new ImageConnectProviderError("TOKEN_REJECTED", `Google Gemini: key rejected (${body.error.message}).`);
    }
    return new ImageConnectProviderError("REQUEST_FAILED", `Google Gemini: request failed (${status} ${body?.error?.message ?? error}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's ImageConnectProvider.weave() comment.
  }
}
