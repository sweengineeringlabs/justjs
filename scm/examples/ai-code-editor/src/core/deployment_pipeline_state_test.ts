import { describe, it, expect, afterEach } from "bun:test";
import {
  DEPLOYMENT_STEP_ORDER,
  getDeploymentPipelines,
  getDeploymentPipeline,
  createDeploymentPipeline,
  deleteDeploymentPipeline,
  markStepSatisfied,
  canActOnStep,
} from "./deployment_pipeline_state.js";
import type { DeploymentPipelineEntry } from "./deployment_pipeline_state.js";

afterEach(() => {
  globalThis.localStorage?.removeItem("justjs:ai-editor:deployment-pipelines");
});

describe("deployment_pipeline_state", () => {
  it("test_get_pipelines_returns_an_empty_array_before_anything_is_created", () => {
    expect(getDeploymentPipelines()).toEqual([]);
  });

  it("test_create_then_get_round_trips_the_real_pipeline", () => {
    createDeploymentPipeline("prod-api");
    const entry = getDeploymentPipeline("prod-api");
    expect(entry).toBeDefined();
    expect(entry!.pipelineName).toBe("prod-api");
    expect(entry!.satisfiedSteps).toEqual([]);
    expect(entry!.stepNotes).toEqual({});
  });

  it("test_creating_the_same_pipeline_name_twice_does_not_duplicate_it", () => {
    createDeploymentPipeline("prod-api");
    createDeploymentPipeline("prod-api");
    expect(getDeploymentPipelines().length).toBe(1);
  });

  it("test_delete_pipeline_drops_only_the_matching_name", () => {
    createDeploymentPipeline("prod-api");
    createDeploymentPipeline("staging-api");
    deleteDeploymentPipeline("prod-api");
    const remaining = getDeploymentPipelines();
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.pipelineName).toBe("staging-api");
  });

  it("test_mark_step_satisfied_records_the_step_and_its_notes", () => {
    createDeploymentPipeline("prod-api");
    markStepSatisfied("prod-api", "build", "ami-123 confirmed ready");
    const entry = getDeploymentPipeline("prod-api")!;
    expect(entry.satisfiedSteps).toEqual(["build"]);
    expect(entry.stepNotes.build).toBe("ami-123 confirmed ready");
  });

  it("test_mark_step_satisfied_does_not_duplicate_an_already_satisfied_step", () => {
    createDeploymentPipeline("prod-api");
    markStepSatisfied("prod-api", "build", "first note");
    markStepSatisfied("prod-api", "build", "updated note");
    const entry = getDeploymentPipeline("prod-api")!;
    expect(entry.satisfiedSteps).toEqual(["build"]);
    expect(entry.stepNotes.build).toBe("updated note");
  });

  it("test_can_act_on_build_is_always_true_with_no_prior_step", () => {
    createDeploymentPipeline("prod-api");
    const entry = getDeploymentPipeline("prod-api")!;
    expect(canActOnStep(entry, "build")).toBe(true);
  });

  it("test_can_act_on_a_later_step_is_false_until_every_prior_step_is_satisfied", () => {
    const entry: DeploymentPipelineEntry = { pipelineName: "p", stepNotes: {}, satisfiedSteps: [], updatedAt: "t" };
    expect(canActOnStep(entry, "test")).toBe(false);
    expect(canActOnStep(entry, "provision")).toBe(false);
    expect(canActOnStep(entry, "rollback")).toBe(false);
  });

  it("test_can_act_on_a_step_becomes_true_once_all_prior_steps_are_satisfied_in_order", () => {
    let entry: DeploymentPipelineEntry = { pipelineName: "p", stepNotes: {}, satisfiedSteps: ["build", "test", "provision"], updatedAt: "t" };
    expect(canActOnStep(entry, "release")).toBe(true);
    expect(canActOnStep(entry, "rollout")).toBe(false);

    entry = { ...entry, satisfiedSteps: [...entry.satisfiedSteps, "release"] };
    expect(canActOnStep(entry, "rollout")).toBe(true);
    expect(canActOnStep(entry, "rollback")).toBe(false);
  });

  it("test_can_act_on_rollback_requires_every_other_step_satisfied_first", () => {
    const almostDone: DeploymentPipelineEntry = {
      pipelineName: "p",
      stepNotes: {},
      satisfiedSteps: DEPLOYMENT_STEP_ORDER.slice(0, 5),
      updatedAt: "t",
    };
    expect(canActOnStep(almostDone, "rollback")).toBe(true);

    const missingOne: DeploymentPipelineEntry = {
      pipelineName: "p",
      stepNotes: {},
      satisfiedSteps: ["build", "test", "release", "rollout"],
      updatedAt: "t",
    };
    expect(canActOnStep(missingOne, "rollback")).toBe(false);
  });
});
