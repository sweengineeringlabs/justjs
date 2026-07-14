import type { ApiAdapter } from "@justjs/transport";
import type { ScmConnectProvider, ScmResource, BearerTokenConfig } from "../api/provider.js";
import { ScmConnectProviderError } from "../api/provider.js";

interface WorkspacesResponse {
  readonly values: Array<{ readonly slug: string; readonly name: string }>;
}

interface RepositoriesResponse {
  readonly values: Array<{
    readonly uuid: string;
    readonly name: string;
    readonly is_private: boolean;
  }>;
}

// Bitbucket - real distinct logic, not a DefaultScmConnectProvider
// instance: unlike GitHub/GitLab, Bitbucket's API has no single
// cross-workspace repo-list endpoint (confirmed via search - repos are
// always scoped under /2.0/repositories/{workspace}). connect() does
// two real calls: list workspaces (this one IS cross-workspace), then
// list repos from the first workspace only - a real, disclosed
// limitation (see the returned resources' scope), not silently
// presented as "all your repos across every workspace." Mirrors AWS's
// own asymmetry in @justjs/cloud-connect (its own core/-level class,
// not a Default*-engine instance).
export class BitbucketScmConnectProvider implements ScmConnectProvider {
  readonly concern = "scmConnect" as const;
  readonly strategy = "bitbucket";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<ScmResource[]> {
    const headers = { Authorization: `Bearer ${this.config.token}` };

    let workspacesResponse;
    try {
      workspacesResponse = await this.apiAdapter.get<WorkspacesResponse>("https://api.bitbucket.org/2.0/workspaces", {
        headers,
      });
    } catch {
      throw new ScmConnectProviderError(
        "NETWORK_ERROR",
        "Bitbucket: network request failed - check your connection (no backend proxy, this calls api.bitbucket.org directly)."
      );
    }
    if (workspacesResponse.error !== undefined) {
      throw this.toError(workspacesResponse.status, workspacesResponse.error);
    }
    const [firstWorkspace] = workspacesResponse.data.values;
    if (!firstWorkspace) {
      return [];
    }

    let reposResponse;
    try {
      reposResponse = await this.apiAdapter.get<RepositoriesResponse>(
        `https://api.bitbucket.org/2.0/repositories/${firstWorkspace.slug}`,
        { headers }
      );
    } catch {
      throw new ScmConnectProviderError(
        "NETWORK_ERROR",
        "Bitbucket: network request failed while listing repositories - check your connection."
      );
    }
    if (reposResponse.error !== undefined) {
      throw this.toError(reposResponse.status, reposResponse.error);
    }
    return reposResponse.data.values.map((r) => ({
      id: r.uuid,
      name: `${firstWorkspace.name}/${r.name}`,
      status: r.is_private ? "private" : "public",
    }));
  }

  private toError(status: number, error: string): ScmConnectProviderError {
    if (status === 401 || status === 403) {
      return new ScmConnectProviderError(
        "TOKEN_REJECTED",
        `Bitbucket: token rejected (${status}) - it may be invalid, expired, or missing a required scope.`
      );
    }
    return new ScmConnectProviderError("REQUEST_FAILED", `Bitbucket: request failed (${status} ${error}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's ScmConnectProvider.weave() comment.
  }
}
