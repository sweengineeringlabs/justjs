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
// CloudWatch was the first implemented method group - a real pilot, not
// a placeholder: it's the one AWS service here with zero cost and zero
// irreversible action even against a real account (an alarm is free and
// instantly deletable), so it's the service this app's first real
// provisioning feature shipped against. EC2 (justjs#144) is the second,
// added once CloudEmu gained a real local test loop for it - ECS/EKS
// method groups are still deliberately NOT declared here yet, for the
// same "declare and abandon" reason CloudWatch's own comment already
// gave: an unimplemented optional method on a shared interface is worse
// than not declaring it, they get added in their own phase alongside a
// real implementation.
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

// AWS's real GetMetricStatistics requires the exact dimension set a
// metric was published under to return anything for a per-resource
// metric (e.g. AWS/EC2's CPUUtilization is dimensioned by InstanceId) -
// without this, a query for one instance's CPU would silently return
// every instance's datapoints mixed together (or nothing, depending on
// how the metric was published). Added alongside the EC2 Monitor
// section's own real per-instance CloudWatch metrics view.
export interface CloudWatchDimension {
  readonly name: string;
  readonly value: string;
}

// EC2 (ADR-0017's "starting now" phase, justjs#144). Unlike CloudWatch,
// RunInstances is real, billable, hard-to-undo AWS spend - the 5 methods
// below ship together in the same change, never split across phases:
// no RunInstances lands without a proven TerminateInstances alongside it
// (this repo's own stated safety gate, not a suggestion).
export interface Ec2InstanceConfig {
  readonly imageId: string;
  readonly instanceType: string;
  readonly keyName?: string;
  readonly subnetId?: string;
  // ADR-0019 Option A - a real cloud-init script, run once at first
  // boot only (never again on that same instance - "redeploying" a
  // change means launching a new instance with new userData, disclosed
  // directly in the UI, not hidden). Passed through as plain text here;
  // AwsCloudProvisioningProvider base64-encodes it, matching
  // RunInstances' own real wire format.
  readonly userData?: string;
  // ADR-0019 Option B, opt-in only - the name of an IAM instance
  // profile the USER already created themselves, outside this app
  // (see ADR-0019's IAM policy: this app never creates IAM roles).
  // Attaching one here is what makes runCommandOnEc2Instance/
  // getEc2CommandStatus below usable for this instance later - leaving
  // it blank means no SSM redeploy path exists for it, same as today.
  readonly iamInstanceProfileName?: string;
}

export interface Ec2InstanceState {
  readonly instanceId: string;
  readonly imageId: string;
  readonly instanceType: string;
  // AWS's own real vocabulary (pending/running/stopping/stopped/
  // shutting-down/terminated) - same "keep provider-native, don't
  // normalize" reasoning CloudWatchAlarmState.stateValue already uses.
  readonly state: string;
  readonly launchTime: string;
  readonly privateIpAddress?: string;
  readonly publicIpAddress?: string;
}

// ADR-0019 Option B - SSM SendCommand's own real, asynchronous shape:
// sending a command returns only a commandId immediately, the actual
// result (still running / succeeded / failed, plus real stdout/stderr)
// has to be fetched separately via GetCommandInvocation. Modeled as two
// methods rather than one blocking call for that reason - a fire-and-
// forget with no status feedback would be real but not honest about
// whether the redeploy actually worked.
export interface Ec2CommandResult {
  readonly commandId: string;
}

export interface Ec2CommandStatus {
  // AWS's own real vocabulary (Pending/InProgress/Success/Failed/
  // Cancelled/TimedOut and a few others) - same "keep provider-native"
  // reasoning every other *State's own status field already uses.
  readonly status: string;
  readonly output?: string;
  readonly errorOutput?: string;
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
    period: number,
    dimensions?: readonly CloudWatchDimension[]
  ): Promise<readonly CloudWatchMetricDatapoint[]>;
  runEc2Instance?(config: Ec2InstanceConfig): Promise<Ec2InstanceState>;
  listEc2Instances?(): Promise<readonly Ec2InstanceState[]>;
  startEc2Instance?(instanceId: string): Promise<void>;
  stopEc2Instance?(instanceId: string): Promise<void>;
  terminateEc2Instance?(instanceId: string): Promise<void>;
  // ADR-0019 Option B - real only for instances the user opted into by
  // setting Ec2InstanceConfig.iamInstanceProfileName at launch; AWS's
  // own real error surfaces for any instance that isn't SSM-managed,
  // this app never predicts eligibility client-side.
  runCommandOnEc2Instance?(instanceId: string, commands: readonly string[]): Promise<Ec2CommandResult>;
  getEc2CommandStatus?(commandId: string, instanceId: string): Promise<Ec2CommandStatus>;
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
