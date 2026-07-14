import type { ApiAdapter } from "@justjs/transport";
import type { CommsConnectProvider, CommsResource, BearerTokenConfig } from "../api/provider.js";
import { CommsConnectProviderError } from "../api/provider.js";

// What each single-call bearer-token provider (spi/discord.ts,
// spi/teams.ts) supplies to this generic engine - real, live-confirmed
// (CORS checked directly) URL, that provider's own real response-shape
// parser, and its real auth header scheme. Discord's real documented
// convention for bot tokens is `Authorization: Bot <token>`, not
// `Bearer` - the one genuine difference between Discord and Teams,
// otherwise identical single-call-bearer-token providers. Defaults to
// "Bearer" since that's the more common convention (Teams/Graph uses
// it as-is).
export interface CommsProviderDescriptor {
  readonly strategy: string;
  readonly name: string;
  readonly url: string;
  readonly authScheme?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly parse: (data: unknown) => CommsResource[];
}

// The one real, default implementation Discord and Microsoft Teams are
// just a configured instance of - both are genuinely the same one-call
// pattern (send a token in a real Authorization header, parse a known
// JSON shape, a real HTTP status distinguishes success from failure).
// Slack is not - see core/slack_provider.ts. Mirrors
// @justjs/cloud-connect's DefaultCloudConnectProvider /
// @justjs/scm-connect's DefaultScmConnectProvider exactly (same concern
// shape, different concern).
export class DefaultCommsConnectProvider implements CommsConnectProvider {
  readonly concern = "commsConnect" as const;
  readonly strategy: string;

  constructor(
    private readonly descriptor: CommsProviderDescriptor,
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.strategy = descriptor.strategy;
  }

  async connect(): Promise<CommsResource[]> {
    const scheme = this.descriptor.authScheme ?? "Bearer";
    let response;
    try {
      response = await this.apiAdapter.get(this.descriptor.url, {
        headers: { Authorization: `${scheme} ${this.config.token}`, ...this.descriptor.extraHeaders },
      });
    } catch (error) {
      throw new CommsConnectProviderError(
        "NETWORK_ERROR",
        `${this.descriptor.name}: network request failed - check your connection (no backend proxy, this calls ${new URL(this.descriptor.url).host} directly).`
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new CommsConnectProviderError(
          "TOKEN_REJECTED",
          `${this.descriptor.name}: token rejected (${response.status}) - it may be invalid, expired, or missing a required scope.`
        );
      }
      throw new CommsConnectProviderError(
        "REQUEST_FAILED",
        `${this.descriptor.name}: request failed (${response.status} ${response.error}).`
      );
    }
    return this.descriptor.parse(response.data);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CommsConnectProvider.weave() comment.
  }
}
