import type { ApiAdapter } from "@justjs/transport";
import type { SocialConnectProvider, SocialResource, BearerTokenConfig } from "../api/provider.js";
import { SocialConnectProviderError } from "../api/provider.js";

// What a single-call bearer-token provider (spi/mastodon.ts) supplies
// to this generic engine - real, live-confirmed (CORS checked directly)
// URL, that provider's own real response-shape parser, and its real
// auth header scheme. Mirrors @justjs/comms-connect's
// CommsProviderDescriptor's own configurable-authScheme shape exactly -
// kept for consistency even though Mastodon is its only user here
// (Bluesky and Reddit both need real distinct core/ classes instead,
// see core/bluesky_provider.ts / core/reddit_provider.ts).
export interface SocialProviderDescriptor {
  readonly strategy: string;
  readonly name: string;
  readonly url: string;
  readonly authScheme?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly parse: (data: unknown) => SocialResource[];
}

// The one real, default implementation Mastodon is just a configured
// instance of - a plain one-call pattern (send a token in a real
// Authorization header, parse a known JSON shape, a real HTTP status
// distinguishes success from failure). Mirrors
// @justjs/comms-connect's DefaultCommsConnectProvider /
// @justjs/cloud-connect's DefaultCloudConnectProvider /
// @justjs/scm-connect's DefaultScmConnectProvider exactly (same concern
// shape, different concern).
export class DefaultSocialConnectProvider implements SocialConnectProvider {
  readonly concern = "socialConnect" as const;
  readonly strategy: string;

  constructor(
    private readonly descriptor: SocialProviderDescriptor,
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.strategy = descriptor.strategy;
  }

  async connect(): Promise<SocialResource[]> {
    const scheme = this.descriptor.authScheme ?? "Bearer";
    let response;
    try {
      response = await this.apiAdapter.get(this.descriptor.url, {
        headers: { Authorization: `${scheme} ${this.config.token}`, ...this.descriptor.extraHeaders },
      });
    } catch {
      throw new SocialConnectProviderError(
        "NETWORK_ERROR",
        `${this.descriptor.name}: network request failed - check your connection (no backend proxy, this calls ${new URL(this.descriptor.url).host} directly).`
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new SocialConnectProviderError(
          "TOKEN_REJECTED",
          `${this.descriptor.name}: token rejected (${response.status}) - it may be invalid, expired, or missing a required scope.`
        );
      }
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `${this.descriptor.name}: request failed (${response.status} ${response.error}).`
      );
    }
    return this.descriptor.parse(response.data);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's SocialConnectProvider.weave() comment.
  }
}
