// Real, persisted state for the deployment-workflow pipeline
// (justjs#153's 6-stage model, justjs#154) - which of the 6 steps a
// named pipeline has satisfied, and the notes recorded for each. Same
// real localStorage-ledger shape core/ec2_ledger.ts/ecs_ledger.ts
// already establish (storage key constant, try/catch get/save dropping
// the key entirely when empty) - extended with a per-step-satisfied
// array, a genuinely new shape in this codebase (confirmed nothing else
// to mirror - the two existing ledgers are flat presence-trackers, not
// state machines).
//
// Build and Rollout strategy are real steps in the sequence but have no
// backend even in principle - no CI/build system exists for "Build",
// and this app only ever manages one instance/task at a time, never a
// fleet, for "Rollout strategy" (no rolling/blue-green/canary
// orchestration capability exists or is planned). Both are pure manual
// attestation: the user's own checkbox, not a provider call - see
// deployment_pipeline_provider.ts's own comment for the 4 steps that do
// go through a real (currently mock) provider.
export type DeploymentStepId = "build" | "test" | "provision" | "release" | "rollout" | "rollback";

export const DEPLOYMENT_STEP_ORDER: readonly DeploymentStepId[] = ["build", "test", "provision", "release", "rollout", "rollback"];

export const DEPLOYMENT_STEP_LABELS: Readonly<Record<DeploymentStepId, string>> = {
  build: "Build",
  test: "Test/verify",
  provision: "Provision",
  release: "Release",
  rollout: "Rollout strategy",
  rollback: "Rollback",
};

export interface DeploymentPipelineEntry {
  readonly pipelineName: string;
  readonly stepNotes: Readonly<Partial<Record<DeploymentStepId, string>>>;
  readonly satisfiedSteps: readonly DeploymentStepId[];
  readonly updatedAt: string;
}

const STORAGE_KEY = "justjs:ai-editor:deployment-pipelines";

export function getDeploymentPipelines(): readonly DeploymentPipelineEntry[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (e): e is DeploymentPipelineEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof e.pipelineName === "string" &&
        typeof e.stepNotes === "object" &&
        Array.isArray(e.satisfiedSteps) &&
        typeof e.updatedAt === "string"
    );
  } catch {
    return [];
  }
}

function saveDeploymentPipelines(entries: readonly DeploymentPipelineEntry[]): void {
  try {
    if (entries.length === 0) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as cloud_credentials.ts.
  }
}

export function getDeploymentPipeline(pipelineName: string): DeploymentPipelineEntry | undefined {
  return getDeploymentPipelines().find((e) => e.pipelineName === pipelineName);
}

export function createDeploymentPipeline(pipelineName: string): void {
  const existing = getDeploymentPipelines();
  if (existing.some((e) => e.pipelineName === pipelineName)) {
    return;
  }
  saveDeploymentPipelines([...existing, { pipelineName, stepNotes: {}, satisfiedSteps: [], updatedAt: new Date().toISOString() }]);
}

export function deleteDeploymentPipeline(pipelineName: string): void {
  saveDeploymentPipelines(getDeploymentPipelines().filter((e) => e.pipelineName !== pipelineName));
}

export function markStepSatisfied(pipelineName: string, stepId: DeploymentStepId, notes: string): void {
  const entries = getDeploymentPipelines();
  const updated = entries.map((e) => {
    if (e.pipelineName !== pipelineName) {
      return e;
    }
    const satisfiedSteps = e.satisfiedSteps.includes(stepId) ? e.satisfiedSteps : [...e.satisfiedSteps, stepId];
    return {
      ...e,
      satisfiedSteps,
      stepNotes: { ...e.stepNotes, [stepId]: notes },
      updatedAt: new Date().toISOString(),
    };
  });
  saveDeploymentPipelines(updated);
}

// The real gate: a step can only be acted on once every step before it
// in DEPLOYMENT_STEP_ORDER is satisfied - Build has no prior step, so
// it's always actionable. Enforced here (not just in the UI's own
// disabled-button rendering) so a click handler can check this
// directly before ever calling a provider/marking a step satisfied,
// per this feature's own real requirement: gating must hold even
// against direct DOM manipulation of a later step's controls, not just
// a hidden/disabled button.
export function canActOnStep(entry: DeploymentPipelineEntry, stepId: DeploymentStepId): boolean {
  const index = DEPLOYMENT_STEP_ORDER.indexOf(stepId);
  if (index <= 0) {
    return true;
  }
  const priorSteps = DEPLOYMENT_STEP_ORDER.slice(0, index);
  return priorSteps.every((s) => entry.satisfiedSteps.includes(s));
}
