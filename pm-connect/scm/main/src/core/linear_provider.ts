import type { ApiAdapter } from "@justjs/transport";
import type { PmConnectProvider, PmResource, BearerTokenConfig } from "../api/provider.js";
import { PmConnectProviderError } from "../api/provider.js";

const ASSIGNED_ISSUES_QUERY = `{
  viewer {
    assignedIssues {
      nodes {
        id
        title
        state { name }
      }
    }
  }
}`;

interface LinearGraphQlResponse {
  readonly data?: {
    readonly viewer?: {
      readonly assignedIssues: { readonly nodes: ReadonlyArray<{ readonly id: string; readonly title: string; readonly state: { readonly name: string } }> };
    };
  };
  readonly errors?: ReadonlyArray<{ readonly message: string; readonly extensions?: { readonly type?: string } }>;
}

// Linear - real distinct logic, not a shared bearer-GET engine: Linear's
// GraphQL API is a real POST (a query body, not query params), and its
// own docs are explicit that the API key goes in `Authorization:
// <token>` with NO "Bearer" prefix - sending one fails auth (confirmed
// via Linear's own docs). Like most GraphQL APIs, a real GraphQL-level
// failure can still arrive as a 200 with a populated `errors` array, so
// connect() checks that regardless of HTTP status, not just response.error.
export class LinearPmConnectProvider implements PmConnectProvider {
  readonly concern = "pmConnect" as const;
  readonly strategy = "linear";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<PmResource[]> {
    let response;
    try {
      response = await this.apiAdapter.post<LinearGraphQlResponse>(
        "https://api.linear.app/graphql",
        { query: ASSIGNED_ISSUES_QUERY },
        { headers: { Authorization: this.config.token } }
      );
    } catch {
      throw new PmConnectProviderError(
        "NETWORK_ERROR",
        "Linear: network request failed - check your connection (no backend proxy, this calls api.linear.app directly)."
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new PmConnectProviderError("TOKEN_REJECTED", `Linear: token rejected (${response.status}) - it may be invalid or revoked.`);
      }
      throw new PmConnectProviderError("REQUEST_FAILED", `Linear: request failed (${response.status} ${response.error}).`);
    }
    const graphQlErrors = response.data.errors;
    if (graphQlErrors && graphQlErrors.length > 0) {
      const authError = graphQlErrors.find((e) => e.extensions?.type === "authentication_error");
      if (authError) {
        throw new PmConnectProviderError("TOKEN_REJECTED", `Linear: token rejected - ${authError.message}`);
      }
      throw new PmConnectProviderError("REQUEST_FAILED", `Linear: request failed - ${graphQlErrors[0]!.message}`);
    }
    const nodes = response.data.data?.viewer?.assignedIssues.nodes ?? [];
    return nodes.map((issue) => ({ id: issue.id, name: issue.title, status: issue.state.name }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's PmConnectProvider.weave() comment.
  }
}
