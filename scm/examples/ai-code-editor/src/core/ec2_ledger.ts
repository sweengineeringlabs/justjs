// Real persisted "resources this app believes it created" ledger
// (justjs#144/ADR-0017's EC2 safety-gate requirement) - this app has no
// backend to remind the user later that a real, billable instance is
// still running, so the reminder has to survive a reload/tab-close on
// its own. localStorage-only, same best-effort try/catch convention as
// cloud_credentials.ts. Reconciled against the real, live
// listAwsEc2Instances() result by the UI (core/ec2_ledger.ts itself has
// no network access) - this is a local belief, not a live source of
// truth, and is corrected whenever a live list succeeds.
export interface Ec2LedgerEntry {
  readonly instanceId: string;
  readonly instanceType: string;
  readonly launchedAt: string;
}

const LEDGER_STORAGE_KEY = "justjs:ai-editor:ec2-ledger";

export function getEc2Ledger(): readonly Ec2LedgerEntry[] {
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
      (e): e is Ec2LedgerEntry =>
        typeof e === "object" && e !== null && typeof e.instanceId === "string" && typeof e.instanceType === "string" && typeof e.launchedAt === "string"
    );
  } catch {
    return [];
  }
}

function saveEc2Ledger(entries: readonly Ec2LedgerEntry[]): void {
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

export function addEc2LedgerEntry(entry: Ec2LedgerEntry): void {
  const existing = getEc2Ledger().filter((e) => e.instanceId !== entry.instanceId);
  saveEc2Ledger([...existing, entry]);
}

export function removeEc2LedgerEntry(instanceId: string): void {
  saveEc2Ledger(getEc2Ledger().filter((e) => e.instanceId !== instanceId));
}

// Called whenever a live listEc2Instances() succeeds - drops any ledger
// entry for an instance that's no longer running/pending/stopped/
// stopping (e.g. terminated directly from the AWS console, outside this
// app), so the reminder doesn't outlive the real resource it's about.
export function reconcileEc2Ledger(liveInstanceIds: ReadonlySet<string>): void {
  const reconciled = getEc2Ledger().filter((e) => liveInstanceIds.has(e.instanceId));
  saveEc2Ledger(reconciled);
}
