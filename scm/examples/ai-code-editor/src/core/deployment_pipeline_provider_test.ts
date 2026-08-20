import { describe, it, expect } from "bun:test";
import { createDeploymentPipelineProvider, MockDeploymentPipelineProvider } from "./deployment_pipeline_provider.js";

describe("deployment_pipeline_provider", () => {
  it("test_create_provider_with_mock_strategy_returns_a_mock_provider", () => {
    const provider = createDeploymentPipelineProvider("mock");
    expect(provider).toBeInstanceOf(MockDeploymentPipelineProvider);
    expect(provider.strategy).toBe("mock");
  });

  it("test_create_provider_with_an_unknown_strategy_throws_a_real_actionable_error", () => {
    expect(() => createDeploymentPipelineProvider("aws")).toThrow(/Unknown deployment pipeline provider strategy/);
  });

  it("test_mock_act_on_step_always_resolves_satisfied_and_echoes_the_real_notes", async () => {
    const provider = new MockDeploymentPipelineProvider();
    const result = await provider.actOnStep("test", "ran the integration suite");
    expect(result.satisfied).toBe(true);
    expect(result.output).toContain("Test/verify");
    expect(result.output).toContain("ran the integration suite");
  });

  it("test_mock_act_on_step_produces_a_real_message_even_with_empty_notes", async () => {
    const provider = new MockDeploymentPipelineProvider();
    const result = await provider.actOnStep("provision", "");
    expect(result.satisfied).toBe(true);
    expect(result.output).toBe("Mock Provision completed successfully.");
  });

  it("test_mock_act_on_step_labels_each_step_correctly", async () => {
    const provider = new MockDeploymentPipelineProvider();
    expect((await provider.actOnStep("release", "")).output).toBe("Mock Release completed successfully.");
    expect((await provider.actOnStep("rollback", "")).output).toBe("Mock Rollback completed successfully.");
  });
});
