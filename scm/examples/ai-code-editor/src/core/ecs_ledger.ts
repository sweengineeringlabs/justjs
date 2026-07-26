// Real persisted "resources this app believes it created" ledger for
// ECS (justjs#144/ADR-0017's ECS phase) - same reasoning as
// core/ec2_ledger.ts. Fargate bills per running task, not per cluster
// (an empty cluster is free) - so this tracks running tasks specifically,
// the actual billable unit, reconciled per-cluster against a live
// listEcsTasks() result (unlike EC2's single flat instance list, ECS
// tasks are scoped to the cluster they were listed from, so
// reconciliation only clears entries for the cluster just queried, not
// every entry across every cluster).
export interface EcsLedgerEntry {
  readonly clusterName: string;
  readonly taskArn: string;
  readonly taskDefinitionArn: string;
  readonly startedAt: string;
}

const LEDGER_STORAGE_KEY = "justjs:ai-editor:ecs-ledger";

export function getEcsLedger(): readonly EcsLedgerEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(LEDGER_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (e): e is EcsLedgerEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.clusterName === "string" &&
        typeof e.taskArn === "string" &&
        typeof e.taskDefinitionArn === "string" &&
        typeof e.startedAt === "string"
    );
  } catch {
    return [];
  }
}

function saveEcsLedger(entries: readonly EcsLedgerEntry[]): void {
  try {
    if (entries.length === 0) {
      globalThis.localStorage?.removeItem(LEDGER_STORAGE_KEY);
    } else {
      globalThis.localStorage?.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as cloud_credentials.ts.
  }
}

export function addEcsLedgerEntry(entry: EcsLedgerEntry): void {
  const existing = getEcsLedger().filter((e) => e.taskArn !== entry.taskArn);
  saveEcsLedger([...existing, entry]);
}

export function removeEcsLedgerEntry(taskArn: string): void {
  saveEcsLedger(getEcsLedger().filter((e) => e.taskArn !== taskArn));
}

// Called whenever a live listEcsTasks(clusterName) succeeds - drops any
// ledger entry for that specific cluster whose task is no longer in the
// live result (e.g. stopped directly from the AWS console), without
// touching entries for other clusters this call didn't ask about.
export function reconcileEcsLedger(clusterName: string, liveTaskArns: ReadonlySet<string>): void {
  const reconciled = getEcsLedger().filter((e) => e.clusterName !== clusterName || liveTaskArns.has(e.taskArn));
  saveEcsLedger(reconciled);
}

export function removeEcsLedgerEntriesForCluster(clusterName: string): void {
  saveEcsLedger(getEcsLedger().filter((e) => e.clusterName !== clusterName));
}
