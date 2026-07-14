import type { ApiAdapter } from "@justjs/transport";
import type { PmConnectProvider, PmResource, JiraSessionConfig } from "../api/provider.js";
import { PmConnectProviderError } from "../api/provider.js";

interface JiraSearchResponse {
  readonly issues: ReadonlyArray<{ readonly id: string; readonly key: string; readonly fields: { readonly summary: string; readonly status: { readonly name: string } } }>;
}

const JIRA_SCOPE_HEADER_HOST = "api.atlassian.com";

// Jira - real distinct logic given an already-established OAuth session
// (see core/jira_oauth.ts for how that session is obtained - a real
// browser redirect + token exchange, not part of this class). connect()
// proves the session's real accessToken/cloudId work and lists the
// user's real assigned issues via the current, non-deprecated search
// endpoint (`/search/jql` - the older `/search` endpoint is
// deprecated/removed, confirmed via Atlassian's own docs). Deliberately
// not paginated beyond the first page: real 2026 community reports
// (JRACLOUD-94632) describe this endpoint's `isLast`/`nextPageToken`
// fields looping rather than terminating - a bounded single real call
// is safer than an unbounded pagination loop trusting a documented-buggy
// signal.
export class JiraPmConnectProvider implements PmConnectProvider {
  readonly concern = "pmConnect" as const;
  readonly strategy = "jira";

  constructor(
    private readonly config: JiraSessionConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<PmResource[]> {
    const url = `https://${JIRA_SCOPE_HEADER_HOST}/ex/jira/${encodeURIComponent(this.config.cloudId)}/rest/api/3/search/jql?jql=${encodeURIComponent("assignee=currentUser()")}&fields=summary,status&maxResults=50`;
    let response;
    try {
      response = await this.apiAdapter.get<JiraSearchResponse>(url, {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
      });
    } catch {
      throw new PmConnectProviderError(
        "NETWORK_ERROR",
        "Jira: network request failed - check your connection (no backend proxy, this calls api.atlassian.com directly)."
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401 || response.status === 403) {
        throw new PmConnectProviderError(
          "TOKEN_REJECTED",
          `Jira: session rejected (${response.status}) - it may have expired (Jira OAuth sessions are short-lived and this app doesn't refresh them) - reconnect to get a new one.`
        );
      }
      throw new PmConnectProviderError("REQUEST_FAILED", `Jira: request failed (${response.status} ${response.error}).`);
    }
    return response.data.issues.map((issue) => ({ id: issue.id, name: `${issue.key}: ${issue.fields.summary}`, status: issue.fields.status.name }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's PmConnectProvider.weave() comment.
  }
}
