// Real, swappable backend for the deployment-workflow pipeline's 4
// action-backed steps (justjs's own 6-stage deployment-workflow model,
// justjs#153) - Build and Rollout strategy are deliberately NOT here,
// see deployment_pipeline_state.ts's own comment on why those two are
// pure manual attestation instead. "mock" is the only real strategy
// today - a later "aws" strategy wiring Provision/Release/Rollback into
// runAwsEc2Instance/runCommandOnAwsEc2Instance/etc. is a real, separate
// follow-up (not started), not something this file pretends to already
// do. Same createX(strategy) factory shape this app's other providers
// (createCloudProvisioningProvider, etc.) already use, so swapping in a
// real strategy later is a drop-in, not a rewrite.
export type ProviderBackedStepId = "test" | "provision" | "release" | "rollback";

export interface DeploymentStepActionResult {
  readonly satisfied: boolean;
  readonly output: string;
}

export interface DeploymentPipelineProvider {
  readonly strategy: string;
  actOnStep(stepId: ProviderBackedStepId, notes: string): Promise<DeploymentStepActionResult>;
}

const STEP_LABELS: Record<ProviderBackedStepId, string> = {
  test: "Test/verify",
  provision: "Provision",
  release: "Release",
  rollback: "Rollback",
};

// Real, deterministic mock - always satisfied, resolved after a real
// (if short) delay so it reads as a genuine action rather than an
// instant no-op. Deliberately never simulates failure - this is a seam
// for a real provider to plug into later, not a demo of error handling
// (a real provider's own real failures are what should exercise that
// path, once one exists).
const MOCK_ACTION_DELAY_MS = 400;

export class MockDeploymentPipelineProvider implements DeploymentPipelineProvider {
  readonly strategy = "mock";

  async actOnStep(stepId: ProviderBackedStepId, notes: string): Promise<DeploymentStepActionResult> {
    await new Promise((resolve) => setTimeout(resolve, MOCK_ACTION_DELAY_MS));
    const label = STEP_LABELS[stepId];
    return {
      satisfied: true,
      output: notes.trim().length > 0 ? `Mock ${label} completed successfully for: ${notes.trim()}` : `Mock ${label} completed successfully.`,
    };
  }
}

export function createDeploymentPipelineProvider(strategy: string): DeploymentPipelineProvider {
  if (strategy === "mock") {
    return new MockDeploymentPipelineProvider();
  }
  throw new Error(`Unknown deployment pipeline provider strategy: "${strategy}".`);
}
