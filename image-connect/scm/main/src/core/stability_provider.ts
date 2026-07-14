import type { ApiAdapter } from "@justjs/transport";
import type { ImageConnectProvider, GeneratedImage, BearerTokenConfig } from "../api/provider.js";
import { ImageConnectProviderError } from "../api/provider.js";

// A real, literal Stability API field - confirmed live/via docs as a
// valid `style_preset` enum value, unlike OpenAI's/Gemini's own
// prompt-only styling.
const CARTOON_STYLE_PRESET = "comic-book";

interface StabilityBalanceResponse {
  readonly credits: number;
}

interface StabilityImageResponse {
  readonly image: string;
  readonly finish_reason: string;
}

interface StabilityErrorResponse {
  readonly name?: string;
  readonly message?: string;
}

// Stability AI - real distinct logic: connect() calls the real, free
// GET /v1/user/balance (never a real billed generation call) - unlike
// OpenAI's/Gemini's own key-check, this one returns a real, useful
// number (actual remaining credits), not just a bare "valid" result.
// generate() sends a real multipart/form-data body (confirmed live/via
// docs - NOT JSON, genuinely different from OpenAI/Gemini) with a real
// style_preset field, and requests `Accept: application/json` so the
// real generated image comes back as base64 in a JSON body rather than
// raw binary bytes (this app's own transport layer has no clean way to
// carry an arbitrary binary HTTP *response* body - only request bodies
// were extended for Heroku's tarball upload - so the JSON-response path
// is the only one this provider can use).
export class StabilityImageConnectProvider implements ImageConnectProvider {
  readonly concern = "imageConnect" as const;
  readonly strategy = "stability";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<string> {
    let response;
    try {
      response = await this.apiAdapter.get<StabilityBalanceResponse>("https://api.stability.ai/v1/user/balance", {
        headers: { Authorization: `Bearer ${this.config.token}` },
      });
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "Stability AI: network request failed - check your connection (no backend proxy, this calls api.stability.ai directly)."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as StabilityErrorResponse | undefined, response.error);
    }
    return `${response.data.credits} credits available`;
  }

  async generate(prompt: string): Promise<GeneratedImage> {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("style_preset", CARTOON_STYLE_PRESET);
    form.append("output_format", "png");

    let response;
    try {
      response = await this.apiAdapter.post<StabilityImageResponse>("https://api.stability.ai/v2beta/stable-image/generate/core", form, {
        headers: { Authorization: `Bearer ${this.config.token}`, Accept: "application/json" },
      });
    } catch {
      throw new ImageConnectProviderError(
        "NETWORK_ERROR",
        "Stability AI: network request failed while generating - check your connection."
      );
    }
    if (response.error !== undefined) {
      throw this.toError(response.status, response.data as StabilityErrorResponse | undefined, response.error);
    }
    if (response.data.finish_reason !== "SUCCESS") {
      throw new ImageConnectProviderError("GENERATION_FAILED", `Stability AI: generation did not succeed (${response.data.finish_reason}).`);
    }
    return { base64: response.data.image, mimeType: "image/png" };
  }

  private toError(status: number, body: StabilityErrorResponse | undefined, error: string): ImageConnectProviderError {
    if (status === 401) {
      return new ImageConnectProviderError("TOKEN_REJECTED", `Stability AI: key rejected (${body?.message ?? "unauthorized"}).`);
    }
    return new ImageConnectProviderError("REQUEST_FAILED", `Stability AI: request failed (${status} ${body?.message ?? error}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's ImageConnectProvider.weave() comment.
  }
}
