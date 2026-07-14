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

  async connect(): Promise<CloudResource[]> {
    let response;
    try {
      response = await this.apiAdapter.get(this.descriptor.url, {
        headers: { Authorization: `Bearer ${this.config.token}`, ...this.descriptor.extraHeaders },
      });
    } catch (error) {
      // TransportError path (network-level failure, no HTTP response at
      // all) - mirrors @justjs/ai-assist's own postToAnthropic() pattern.
      throw new CloudConnectProviderError(
        "NETWORK_ERROR",
        `${this.descriptor.name}: network request failed - check your connection (no backend proxy, this calls ${new URL(this.descriptor.url).host} directly).`
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
