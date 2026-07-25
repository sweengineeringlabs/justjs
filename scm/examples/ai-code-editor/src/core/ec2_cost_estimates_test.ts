import { describe, it, expect } from "bun:test";
import { EC2_INSTANCE_TYPE_OPTIONS, formatEc2HourlyEstimate } from "./ec2_cost_estimates.js";

describe("ec2_cost_estimates", () => {
  it("test_format_hourly_estimate_returns_a_real_dollar_figure_for_a_known_instance_type", () => {
    expect(formatEc2HourlyEstimate("t3.micro")).toBe("~$0.0104/hr (us-east-1 on-demand, estimated)");
  });

  it("test_format_hourly_estimate_returns_an_honest_unknown_message_for_an_unlisted_instance_type", () => {
    expect(formatEc2HourlyEstimate("p4d.24xlarge")).toBe("cost unknown for this instance type");
  });

  it("test_every_offered_instance_type_option_has_a_positive_hourly_estimate", () => {
    for (const option of EC2_INSTANCE_TYPE_OPTIONS) {
      expect(option.hourlyUsdEstimate).toBeGreaterThan(0);
    }
  });
});
