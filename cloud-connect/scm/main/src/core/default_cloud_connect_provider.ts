import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, BearerTokenConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";

// What each bearer-token provider (spi/<provider>.ts) supplies to this
// generic engine - real, live-confirmed (CORS checked directly) URL,
// any extra headers a specific provider needs (e.g. Heroku's Accept
// header), and that provider's own real response-shape parser, since
// every API returns a genuinely different JSON shape.
export interface BearerProviderDescriptor {
  readonly strategy: string;
  readonly name: string;
  readonly url: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly parse: (data: unknown) => CloudResource[];
}

// The one real, default implementation every bearer-token provider
// (DigitalOcean/Netlify/Vercel/Heroku/Azure/Google Cloud) is just a
// configured instance of - they're genuinely one pattern (paste a
// token, send as `Authorization: Bearer`, parse a known JSON shape),
// not 6 near-identical classes. Each provider's own specific
// descriptor + self-registration lives under spi/, per this package's
// SAF convention (api/core/saf/spi) - core holds only this shared,
// provider-agnostic engine.
export class DefaultCloudConnectProvider implements CloudConnectProvider {
  readonly concern = "cloudConnect" as const;
  readonly strategy: string;

  constructor(
    private readonly descriptor: BearerProviderDescriptor,
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.strategy = descriptor.strategy;
  }

  // Real local/CI testing seam (justjs#143) - overrides only the request
  // URL, keyed by the descriptor's own strategy name
  // (CLOUD_CONNECT_AZURE_ENDPOINT, CLOUD_CONNECT_DIGITALOCEAN_ENDPOINT,
  // etc.), one shared implementation for all 6 bearer providers rather
  // than repeating this in each spi/<provider>.ts. Absent in production -
  // read once per connect() call, Node/bun-process-level only, never
  // bundled into the browser app (ai-code-editor never sets these).
  private resolvedUrl(): string {
    const envVar = `CLOUD_CONNECT_${this.descriptor.strategy.toUpperCase()}_ENDPOINT`;
    return typeof process !== "undefined" ? (process.env[envVar] ?? this.descriptor.url) : this.descriptor.url;
  }

  async connect(): Promise<CloudResource[]> {
    const url = this.resolvedUrl();
    let response;
    try {
      response = await this.apiAdapter.get(url, {
        headers: { Authorization: `Bearer ${this.config.token}`, ...this.descriptor.extraHeaders },
      });
    } catch (error) {
      // TransportError path (network-level failure, no HTTP response at
      // all) - mirrors @justjs/ai-assist's own postToAnthropic() pattern.
      throw new CloudConnectProviderError(
        "NETWORK_ERROR",
        `${this.descriptor.name}: network request failed - check your connection (no backend proxy, this calls ${new URL(url).host} directly).`
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new CloudConnectProviderError(
          "TOKEN_REJECTED",
          `${this.descriptor.name}: token rejected (${response.status}) - it may be invalid, expired, or missing a required scope.`
        );
      }
      throw new CloudConnectProviderError(
        "REQUEST_FAILED",
        `${this.descriptor.name}: request failed (${response.status} ${response.error}).`
      );
    }
    return this.descriptor.parse(response.data);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CloudConnectProvider.weave() comment.
  }
}
