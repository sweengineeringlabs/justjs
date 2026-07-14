import type { ApiAdapter } from "@justjs/transport";
import type { ScmConnectProvider, ScmResource, BearerTokenConfig } from "../api/provider.js";
import { ScmConnectProviderError } from "../api/provider.js";

// What each single-call bearer-token provider (spi/github.ts,
// spi/gitlab.ts) supplies to this generic engine - real, live-confirmed
// (CORS checked directly) URL and that provider's own real
// response-shape parser, since GitHub's and GitLab's real repo-list
// APIs return genuinely different JSON shapes.
export interface ScmProviderDescriptor {
  readonly strategy: string;
  readonly name: string;
  readonly url: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly parse: (data: unknown) => ScmResource[];
}

// The one real, default implementation GitHub and GitLab are just a
// configured instance of - both are genuinely the same one-call pattern
// (paste a token, send as `Authorization: Bearer`, parse a known JSON
// shape). Bitbucket is not - see core/bitbucket_provider.ts. Mirrors
// @justjs/cloud-connect's DefaultCloudConnectProvider exactly (same
// concern shape, different concern).
export class DefaultScmConnectProvider implements ScmConnectProvider {
  readonly concern = "scmConnect" as const;
  readonly strategy: string;

  constructor(
    private readonly descriptor: ScmProviderDescriptor,
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.strategy = descriptor.strategy;
  }

  async connect(): Promise<ScmResource[]> {
    let response;
    try {
      response = await this.apiAdapter.get(this.descriptor.url, {
        headers: { Authorization: `Bearer ${this.config.token}`, ...this.descriptor.extraHeaders },
      });
    } catch (error) {
      throw new ScmConnectProviderError(
        "NETWORK_ERROR",
        `${this.descriptor.name}: network request failed - check your connection (no backend proxy, this calls ${new URL(this.descriptor.url).host} directly).`
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new ScmConnectProviderError(
          "TOKEN_REJECTED",
          `${this.descriptor.name}: token rejected (${response.status}) - it may be invalid, expired, or missing a required scope.`
        );
      }
      throw new ScmConnectProviderError(
        "REQUEST_FAILED",
        `${this.descriptor.name}: request failed (${response.status} ${response.error}).`
      );
    }
    return this.descriptor.parse(response.data);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's ScmConnectProvider.weave() comment.
  }
}
