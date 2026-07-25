import type { AspectTarget } from "@justjs/application";

// New concern ("cloudProvisioning") separate from "cloudConnect" - EC2/
// ECS/EKS/CloudWatch provisioning is AWS-only, multi-step, and stateful
// in a way listInstances()/deploy() (single-call reads, or one bounded
// upload-and-poll flow) never were. Bolting these onto
// CloudConnectProvider - shared by 7 unrelated providers - would repeat
// the exact anti-pattern its own design already avoids for the other
// direction (see that file's own comment on why a generic "extra
// actions" slot was rejected for just 2 call sites).
//
// CloudWatch is the first (and, this phase, only) implemented method
// group - a real pilot, not a placeholder: it's the one AWS service
// here with zero cost and zero irreversible action even against a real
// account (an alarm is free and instantly deletable), so it's the
// service this app's first real provisioning feature ships against.
// EC2/ECS/EKS method groups are deliberately NOT declared here yet -
// adding an unimplemented optional method to a shared interface before
// any provider actually implements it is exactly the "declare and
// abandon" pattern to avoid; they get added in their own phase,
// alongside a real implementation.
export interface CloudWatchAlarmConfig {
  readonly alarmName: string;
  readonly metricName: string;
  readonly namespace: string;
  readonly statistic: "SampleCount" | "Average" | "Sum" | "Minimum" | "Maximum";
  readonly period: number;
  readonly evaluationPeriods: number;
  readonly threshold: number;
  readonly comparisonOperator:
    | "GreaterThanThreshold"
    | "GreaterThanOrEqualToThreshold"
    | "LessThanThreshold"
    | "LessThanOrEqualToThreshold";
  readonly alarmDescription?: string;
}

export interface CloudWatchAlarmState {
  readonly alarmName: string;
  readonly alarmArn: string;
  readonly metricName: string;
  readonly namespace: string;
  readonly statistic: string;
  readonly period: number;
  readonly evaluationPeriods: number;
  readonly threshold: number;
  readonly comparisonOperator: string;
  // AWS's own real vocabulary (OK/ALARM/INSUFFICIENT_DATA) - kept as-is,
  // same reasoning every other *-connect provider's own `status` field
  // already uses provider-specific vocabulary rather than a normalized
  // enum.
  readonly stateValue: string;
}

export interface CloudWatchMetricDatapoint {
  readonly timestamp: string;
  readonly value: number;
  readonly unit: string;
}

export interface CloudProvisioningProvider {
  readonly concern: "cloudProvisioning";
  readonly strategy: string;
  putCloudWatchAlarm?(config: CloudWatchAlarmConfig): Promise<void>;
  listCloudWatchAlarms?(): Promise<readonly CloudWatchAlarmState[]>;
  deleteCloudWatchAlarm?(alarmName: string): Promise<void>;
  getCloudWatchMetricStatistics?(
    namespace: string,
    metricName: string,
    statistic: CloudWatchAlarmConfig["statistic"],
    startTime: string,
    endTime: string,
    period: number
  ): Promise<readonly CloudWatchMetricDatapoint[]>;
  // Real no-op, same boot()-contract reason CloudConnectProvider.weave()
  // exists - see api/provider.ts's own comment on that method.
  weave(target: AspectTarget): void;
}

export class CloudProvisioningProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CloudProvisioningProviderError";
  }
}
