// Real cost disclosure for ECS Fargate's Configure step (justjs#144/
// ADR-0017's ECS phase) - same "show an actual number, not just a size
// name" reasoning as core/ec2_cost_estimates.ts. Sourced from AWS's own
// long-published us-east-1 on-demand Fargate Linux/X86 rates
// (aws.amazon.com/fargate/pricing): $0.04048 per vCPU-hour, $0.004445
// per GB-hour. Only the curated cpu/memory combinations this app's
// Configure form offers (a subset of Fargate's real valid pairings, not
// every one AWS allows), only us-east-1, not re-fetched live (same
// unauthenticated-public-pricing-API limitation ec2_cost_estimates.ts
// already discloses). Shown as an estimate, not an authoritative quote.
export interface EcsFargateSizeOption {
  readonly cpu: string;
  readonly memory: string;
  readonly label: string;
  readonly hourlyUsdEstimate: number;
}

const VCPU_HOURLY_USD = 0.04048;
const GB_HOURLY_USD = 0.004445;

function estimate(cpu: number, memory: number): number {
  return (cpu / 1024) * VCPU_HOURLY_USD + (memory / 1024) * GB_HOURLY_USD;
}

export const ECS_FARGATE_SIZE_OPTIONS: readonly EcsFargateSizeOption[] = [
  { cpu: "256", memory: "512", label: "0.25 vCPU, 0.5 GB", hourlyUsdEstimate: estimate(256, 512) },
  { cpu: "256", memory: "1024", label: "0.25 vCPU, 1 GB", hourlyUsdEstimate: estimate(256, 1024) },
  { cpu: "512", memory: "1024", label: "0.5 vCPU, 1 GB", hourlyUsdEstimate: estimate(512, 1024) },
  { cpu: "512", memory: "2048", label: "0.5 vCPU, 2 GB", hourlyUsdEstimate: estimate(512, 2048) },
  { cpu: "1024", memory: "2048", label: "1 vCPU, 2 GB", hourlyUsdEstimate: estimate(1024, 2048) },
  { cpu: "1024", memory: "4096", label: "1 vCPU, 4 GB", hourlyUsdEstimate: estimate(1024, 4096) },
];

export function formatEcsFargateHourlyEstimate(cpu: string, memory: string): string {
  const option = ECS_FARGATE_SIZE_OPTIONS.find((o) => o.cpu === cpu && o.memory === memory);
  return option ? `~$${option.hourlyUsdEstimate.toFixed(4)}/hr (us-east-1 Fargate on-demand, estimated)` : "cost unknown for this size";
}
