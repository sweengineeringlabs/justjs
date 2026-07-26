import { describe, it, expect } from "bun:test";
import { ECS_FARGATE_SIZE_OPTIONS, formatEcsFargateHourlyEstimate } from "./ecs_cost_estimates.js";

describe("ecs_cost_estimates", () => {
  it("test_format_hourly_estimate_returns_a_real_dollar_figure_for_a_known_size", () => {
    expect(formatEcsFargateHourlyEstimate("256", "512")).toBe("~$0.0123/hr (us-east-1 Fargate on-demand, estimated)");
  });

  it("test_format_hourly_estimate_scales_with_a_larger_known_size", () => {
    expect(formatEcsFargateHourlyEstimate("1024", "2048")).toBe("~$0.0494/hr (us-east-1 Fargate on-demand, estimated)");
  });

  it("test_format_hourly_estimate_returns_an_honest_unknown_message_for_an_unlisted_size", () => {
    expect(formatEcsFargateHourlyEstimate("16384", "32768")).toBe("cost unknown for this size");
  });

  it("test_every_offered_size_option_has_a_positive_hourly_estimate", () => {
    for (const option of ECS_FARGATE_SIZE_OPTIONS) {
      expect(option.hourlyUsdEstimate).toBeGreaterThan(0);
    }
  });
});
