// Real consolidated view across all connected Comms providers
// (justjs#137) - merges each connected provider's own real connect()
// result (CommsResource[] - Slack's channels directly, Discord's/
// Teams' own top-level guilds/teams, same granularity every other
// Comms screen already treats as "connect()'s own real result") into
// one list, tagged by source. Dependency-injected (mirrors
// components/agent_comms_tools.ts's already-proven shape, and
// core/socials_dashboard.ts's sibling module) so the real merge/
// error-isolation logic is unit-testable without real
// localStorage/network. "Connected" is derived from the injected
// resolver itself, not a separate real-localStorage check - see
// socials_dashboard.ts's own comment for the real bug that convention
// avoids.
import { COMMS_PROVIDER_CATALOG } from "./comms_catalog.js";
import { getStoredCommsToken } from "./comms_credentials.js";
import { connectSlack, connectDiscord, connectTeams } from "./comms_connect.js";
import type { CommsResource } from "./comms_connect.js";

export interface CommsDashboardEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly resource: CommsResource;
}

export interface CommsDashboardError {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface CommsDashboardResult {
  readonly entries: readonly CommsDashboardEntry[];
  readonly errors: readonly CommsDashboardError[];
}

export interface CommsDashboardDeps {
  readonly resolveCommsToken: (providerId: string) => string;
  readonly connectSlack: (token: string) => Promise<CommsResource[]>;
  readonly connectDiscord: (token: string) => Promise<CommsResource[]>;
  readonly connectTeams: (token: string) => Promise<CommsResource[]>;
}

const REAL_DEPS: CommsDashboardDeps = {
  resolveCommsToken: getStoredCommsToken,
  connectSlack,
  connectDiscord,
  connectTeams,
};

const CONNECT_BY_ID: Record<string, keyof CommsDashboardDeps> = {
  slack: "connectSlack",
  discord: "connectDiscord",
  teams: "connectTeams",
};

export async function fetchCommsDashboard(deps: CommsDashboardDeps = REAL_DEPS): Promise<CommsDashboardResult> {
  const connectedProviders = COMMS_PROVIDER_CATALOG.filter((p) => deps.resolveCommsToken(p.id).length > 0);

  const settled = await Promise.allSettled(
    connectedProviders.map((p) => {
      const connectFn = deps[CONNECT_BY_ID[p.id]!] as (token: string) => Promise<CommsResource[]>;
      return connectFn(deps.resolveCommsToken(p.id));
    })
  );

  const entries: CommsDashboardEntry[] = [];
  const errors: CommsDashboardError[] = [];
  settled.forEach((result, i) => {
    const p = connectedProviders[i]!;
    if (result.status === "fulfilled") {
      entries.push(...result.value.map((resource) => ({ providerId: p.id, providerName: p.name, providerIcon: p.icon, resource })));
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ providerId: p.id, providerName: p.name, message });
    }
  });

  return { entries, errors };
}
