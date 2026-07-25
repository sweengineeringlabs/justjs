// Thin app-local adapter over @justjs/cloud-connect's "cloudProvisioning"
// concern's EC2 method group (justjs#144/ADR-0017) - same role
// core/cloud_provisioning.ts plays for CloudWatch alarms.
import { createCloudProvisioningProvider } from "@justjs/cloud-connect";
import type { CloudWatchMetricDatapoint, Ec2CommandResult, Ec2CommandStatus, Ec2InstanceConfig, Ec2InstanceState } from "@justjs/cloud-connect";

export type { CloudWatchMetricDatapoint, Ec2CommandResult, Ec2CommandStatus, Ec2InstanceConfig, Ec2InstanceState };

export function runAwsEc2Instance(accessKeyId: string, secretAccessKey: string, config: Ec2InstanceConfig): Promise<Ec2InstanceState> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).runEc2Instance!(config);
}

export function listAwsEc2Instances(accessKeyId: string, secretAccessKey: string): Promise<readonly Ec2InstanceState[]> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).listEc2Instances!();
}

export function startAwsEc2Instance(accessKeyId: string, secretAccessKey: string, instanceId: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).startEc2Instance!(instanceId);
}

export function stopAwsEc2Instance(accessKeyId: string, secretAccessKey: string, instanceId: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).stopEc2Instance!(instanceId);
}

export function terminateAwsEc2Instance(accessKeyId: string, secretAccessKey: string, instanceId: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).terminateEc2Instance!(instanceId);
}

// ADR-0019 Option B, opt-in only - real only for an instance the user
// launched with an iamInstanceProfileName; this app never checks
// eligibility client-side, AWS's own real error surfaces otherwise.
export function runCommandOnAwsEc2Instance(
  accessKeyId: string,
  secretAccessKey: string,
  instanceId: string,
  commands: readonly string[]
): Promise<Ec2CommandResult> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).runCommandOnEc2Instance!(instanceId, commands);
}

export function getAwsEc2CommandStatus(
  accessKeyId: string,
  secretAccessKey: string,
  commandId: string,
  instanceId: string
): Promise<Ec2CommandStatus> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).getEc2CommandStatus!(commandId, instanceId);
}

// Real per-instance CloudWatch metrics for the Instances tile's Monitor
// section - reuses the same getCloudWatchMetricStatistics() the Alarms
// tile already calls, scoped to one instance via the real AWS/EC2
// CPUUtilization dimension (InstanceId) - without it AWS returns no
// data for this per-resource metric. Last hour, 5-minute buckets,
// Average - a reasonable default window, not user-configurable yet.
export function getAwsEc2CpuUtilization(
  accessKeyId: string,
  secretAccessKey: string,
  instanceId: string
): Promise<readonly CloudWatchMetricDatapoint[]> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - 60 * 60 * 1000);
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).getCloudWatchMetricStatistics!(
    "AWS/EC2",
    "CPUUtilization",
    "Average",
    startTime.toISOString(),
    endTime.toISOString(),
    300,
    [{ name: "InstanceId", value: instanceId }]
  );
}
