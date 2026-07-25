export type {
  CloudConnectProvider,
  CloudResource,
  BearerTokenConfig,
  AwsCredentialsConfig,
  CloudConnectProviderConfig,
  CloudDeployFile,
  CloudDeployResult,
} from "../api/provider.js";
export { CloudConnectProviderError } from "../api/provider.js";
export type {
  DashboardAnalyticsProvider,
  DashboardAnalyticsSnapshot,
  AnalyticsMetric,
  TrendingItem,
  ActivityItem,
  AnalyticsProviderConfig,
} from "../api/analytics.js";
export { DashboardAnalyticsProviderError } from "../api/analytics.js";
export type {
  CloudProvisioningProvider,
  CloudWatchAlarmConfig,
  CloudWatchAlarmState,
  CloudWatchMetricDatapoint,
} from "../api/provisioning.js";
export { CloudProvisioningProviderError } from "../api/provisioning.js";

// Same justjs#91-pattern fix @justjs/ai-assist's own saf/index.ts
// applies - importing this module's own spi/index.ts for its side
// effect means a bare `import { createCloudConnectProvider } from
// "@justjs/cloud-connect"` genuinely self-registers all 7 strategies,
// unlike the six aop-* packages (whose spi/index.ts is dead code - no
// "./spi" exports subpath, never imported from saf/index.ts).
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { CloudConnectProvider, CloudConnectProviderConfig, AwsCredentialsConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import type { DashboardAnalyticsProvider, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";
import type { CloudProvisioningProvider } from "../api/provisioning.js";
import { CloudProvisioningProviderError } from "../api/provisioning.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// same rule @justjs/ai-assist's saf/index.ts follows) - callers depend
// on the CloudConnectProvider contract, never a concrete provider class
// name. Resolves through the same justjs.providers registry spi/
// already populated (the `import "../spi/index.js"` above guarantees
// every strategy is registered before this can be called) rather than
// duplicating each provider's config/lookup here - core/spi already
// know how to build each strategy, this just asks the registry for it.
export function createCloudConnectProvider(strategy: string, config: CloudConnectProviderConfig): CloudConnectProvider {
  const spec = justjs.providers.resolve("cloudConnect", strategy);
  if (!spec) {
    throw new CloudConnectProviderError("UNKNOWN_STRATEGY", `@justjs/cloud-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as CloudConnectProvider;
}

// Same factory pattern, separate concern ("dashboardAnalytics", justjs#139)
// - only "testcloud" exists today (see spi/test_dashboard_analytics.ts);
// real per-provider strategies land once each provider's own
// notifications/activity API is wired up.
export function createCloudDashboardAnalyticsProvider(strategy: string, config: AnalyticsProviderConfig): DashboardAnalyticsProvider {
  const spec = justjs.providers.resolve("dashboardAnalytics", strategy);
  if (!spec) {
    throw new DashboardAnalyticsProviderError("UNKNOWN_STRATEGY", `@justjs/cloud-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as DashboardAnalyticsProvider;
}

// Same factory pattern, separate concern ("cloudProvisioning") - only
// "aws" exists today (CloudWatch alarms - the pilot service, see
// core/aws_cloudwatch_provider.ts's own comment on why it's first).
// EC2/ECS/EKS provisioning strategies land in their own later phases.
export function createCloudProvisioningProvider(strategy: string, config: AwsCredentialsConfig): CloudProvisioningProvider {
  const spec = justjs.providers.resolve("cloudProvisioning", strategy);
  if (!spec) {
    throw new CloudProvisioningProviderError("UNKNOWN_STRATEGY", `@justjs/cloud-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as CloudProvisioningProvider;
}
