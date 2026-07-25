// Real cost disclosure for EC2's Configure step (justjs#144/ADR-0017) -
// EC2 is the first genuinely billable, hard-to-undo action this app can
// take, so Configure must show an actual number, not just an instance
// type name. Sourced from AWS's own long-published us-east-1 on-demand
// Linux rates (aws.amazon.com/ec2/pricing/on-demand) - approximate and
// deliberately narrow: only the handful of instance types this app's
// Configure form offers, only us-east-1 (this provider's only region,
// see aws_cloud_provisioning_provider.ts's own REGION constant), and not
// re-fetched live (AWS has no unauthenticated public pricing API this
// browser-only app could call). Disclosed as an estimate in the UI, not
// presented as an authoritative live quote - a known, honest limitation,
// not silently assumed accurate forever.
export interface Ec2InstanceTypeOption {
  readonly instanceType: string;
  readonly label: string;
  readonly hourlyUsdEstimate: number;
}

export const EC2_INSTANCE_TYPE_OPTIONS: readonly Ec2InstanceTypeOption[] = [
  { instanceType: "t3.micro", label: "t3.micro (2 vCPU, 1 GiB)", hourlyUsdEstimate: 0.0104 },
  { instanceType: "t3.small", label: "t3.small (2 vCPU, 2 GiB)", hourlyUsdEstimate: 0.0208 },
  { instanceType: "t3.medium", label: "t3.medium (2 vCPU, 4 GiB)", hourlyUsdEstimate: 0.0416 },
  { instanceType: "t3.large", label: "t3.large (2 vCPU, 8 GiB)", hourlyUsdEstimate: 0.0832 },
  { instanceType: "m5.large", label: "m5.large (2 vCPU, 8 GiB)", hourlyUsdEstimate: 0.096 },
  { instanceType: "m5.xlarge", label: "m5.xlarge (4 vCPU, 16 GiB)", hourlyUsdEstimate: 0.192 },
];

export function formatEc2HourlyEstimate(instanceType: string): string {
  const option = EC2_INSTANCE_TYPE_OPTIONS.find((o) => o.instanceType === instanceType);
  return option ? `~$${option.hourlyUsdEstimate.toFixed(4)}/hr (us-east-1 on-demand, estimated)` : "cost unknown for this instance type";
}
