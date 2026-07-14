import type { ApiAdapter } from "@justjs/transport";
import type { PmConnectProvider, PmResource, BearerTokenConfig } from "../api/provider.js";
import { PmConnectProviderError } from "../api/provider.js";

interface WorkspacesResponse {
  readonly data: ReadonlyArray<{ readonly gid: string; readonly name: string }>;
}

interface TasksResponse {
  readonly data: ReadonlyArray<{ readonly gid: string; readonly name: string; readonly completed: boolean }>;
}

interface AsanaErrorResponse {
  readonly errors?: ReadonlyArray<{ readonly message: string }>;
}

// Asana - real distinct logic, not a shared bearer-GET engine: Asana's
// API has no single "my tasks across everything" endpoint - `GET
// /tasks` requires either a `project`/`tag`, or the `assignee`+
// `workspace` pair together (confirmed via Asana's own docs). connect()
// does two real calls: discover the first real workspace, then list the
// current user's real tasks within it - a real, disclosed limitation
// (first workspace only) rather than silently presented as "every task
// across every workspace," same asymmetry precedent as scm-connect's
// Bitbucket provider. Asana's default ("compact") task objects omit
// `completed` unless explicitly requested via `opt_fields` (confirmed
// via Asana's own docs) - a real gotcha this provider bakes in rather
// than silently returning tasks with no real status.
export class AsanaPmConnectProvider implements PmConnectProvider {
  readonly concern = "pmConnect" as const;
  readonly strategy = "asana";

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<PmResource[]> {
    const headers = { Authorization: `Bearer ${this.config.token}` };

    let workspacesResponse;
    try {
      workspacesResponse = await this.apiAdapter.get<WorkspacesResponse>("https://app.asana.com/api/1.0/workspaces", { headers });
    } catch {
      throw new PmConnectProviderError(
        "NETWORK_ERROR",
        "Asana: network request failed - check your connection (no backend proxy, this calls app.asana.com directly)."
      );
    }
    if (workspacesResponse.error !== undefined) {
      throw this.toError(workspacesResponse.status, workspacesResponse.data as AsanaErrorResponse | undefined, workspacesResponse.error);
    }
    const [firstWorkspace] = workspacesResponse.data.data;
    if (!firstWorkspace) {
      return [];
    }

    let tasksResponse;
    try {
      tasksResponse = await this.apiAdapter.get<TasksResponse>(
        `https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${encodeURIComponent(firstWorkspace.gid)}&opt_fields=name,completed`,
        { headers }
      );
    } catch {
      throw new PmConnectProviderError(
        "NETWORK_ERROR",
        "Asana: network request failed while listing tasks - check your connection."
      );
    }
    if (tasksResponse.error !== undefined) {
      throw this.toError(tasksResponse.status, tasksResponse.data as AsanaErrorResponse | undefined, tasksResponse.error);
    }
    return tasksResponse.data.data.map((t) => ({ id: t.gid, name: t.name, status: t.completed ? "completed" : "incomplete" }));
  }

  private toError(status: number, body: AsanaErrorResponse | undefined, error: string): PmConnectProviderError {
    if (status === 401 || status === 403) {
      return new PmConnectProviderError("TOKEN_REJECTED", `Asana: token rejected (${status}) - it may be invalid, expired, or missing a required scope.`);
    }
    const message = body?.errors?.[0]?.message ?? error;
    return new PmConnectProviderError("REQUEST_FAILED", `Asana: request failed (${status} ${message}).`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's PmConnectProvider.weave() comment.
  }
}
