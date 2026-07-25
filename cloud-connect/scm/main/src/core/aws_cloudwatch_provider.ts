import type { ApiAdapter } from "@justjs/transport";
import type { AwsCredentialsConfig } from "../api/provider.js";
import type {
  CloudProvisioningProvider,
  CloudWatchAlarmConfig,
  CloudWatchAlarmState,
  CloudWatchMetricDatapoint,
} from "../api/provisioning.js";
import { CloudProvisioningProviderError } from "../api/provisioning.js";
import { signAwsRequest } from "./aws_sigv4.js";

const REGION = "us-east-1";
const SERVICE = "monitoring";

// Real local/CI testing seam (justjs#143's own pattern) - overrides only
// the destination URL, signing stays pinned to the real host/region/
// service. Absent in production.
function endpointOverride(envVar: string, realUrl: string): string {
  return typeof process !== "undefined" ? (process.env[envVar] ?? realUrl) : realUrl;
}

interface CloudWatchErrorResponse {
  readonly Error?: { readonly Code: string; readonly Message: string };
}

interface PutMetricAlarmResponse extends CloudWatchErrorResponse {}

interface DescribeAlarmsResponse extends CloudWatchErrorResponse {
  readonly DescribeAlarmsResponse?: {
    readonly DescribeAlarmsResult?: {
      readonly MetricAlarms?: readonly {
        readonly AlarmName: string;
        readonly AlarmArn: string;
        readonly MetricName: string;
        readonly Namespace: string;
        readonly Statistic: string;
        readonly Period: number;
        readonly EvaluationPeriods: number;
        readonly Threshold: number;
        readonly ComparisonOperator: string;
        readonly StateValue: string;
      }[];
    };
  };
}

interface DeleteAlarmsResponse extends CloudWatchErrorResponse {}

interface GetMetricStatisticsResponse extends CloudWatchErrorResponse {
  readonly GetMetricStatisticsResponse?: {
    readonly GetMetricStatisticsResult?: {
      readonly Datapoints?: readonly Record<string, string | number>[];
    };
  };
}

// AWS's real Query-protocol convention for a write call with more than
// 1-2 params: POST with the params as an application/x-www-form-
// urlencoded body (not a GET query string) - the canonical request's
// own "query" component is empty; the body is what gets sign-hashed
// (justjs cloud provisioning Phase 0's aws_sigv4.ts body-signing
// extension). Confirmed against AWS's own published CloudWatch API
// reference, not yet live-verified against a real AWS account (unlike
// STS/EC2 in aws_provider.ts, which this session did verify live) -
// flagged honestly, not silently assumed equivalent.
function encodeParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

// Real CloudWatch provisioning - the pilot service for justjs's cloud
// workflow feature (connect -> configure -> deploy -> monitor). Chosen
// first specifically because an alarm is free and instantly deletable
// even against a real AWS account - no other AWS service this app talks
// to has that property. Implements CloudProvisioningProvider's
// CloudWatch method group only; EC2/ECS/EKS land in their own later
// phases, each with a real implementation, not a stub.
export class AwsCloudWatchProvisioningProvider implements CloudProvisioningProvider {
  readonly concern = "cloudProvisioning" as const;
  readonly strategy = "aws";

  constructor(
    private readonly config: AwsCredentialsConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  private async call<T extends CloudWatchErrorResponse>(action: string, params: Record<string, string>): Promise<T> {
    const body = encodeParams({ Action: action, Version: "2010-08-01", ...params });
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: SERVICE,
      method: "POST",
      host: "monitoring.amazonaws.com",
      path: "/",
      query: "",
      body,
      extraHeaders: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_CLOUDWATCH_ENDPOINT", "https://monitoring.amazonaws.com");
    const response = await this.apiAdapter.post<T>(endpoint + "/", body, { headers });
    if (response.data.Error) {
      throw new CloudProvisioningProviderError(
        response.data.Error.Code,
        `CloudWatch: ${response.data.Error.Code} - ${response.data.Error.Message}`
      );
    }
    return response.data;
  }

  async putCloudWatchAlarm(config: CloudWatchAlarmConfig): Promise<void> {
    await this.call<PutMetricAlarmResponse>("PutMetricAlarm", {
      AlarmName: config.alarmName,
      MetricName: config.metricName,
      Namespace: config.namespace,
      Statistic: config.statistic,
      Period: String(config.period),
      EvaluationPeriods: String(config.evaluationPeriods),
      Threshold: String(config.threshold),
      ComparisonOperator: config.comparisonOperator,
      ...(config.alarmDescription !== undefined ? { AlarmDescription: config.alarmDescription } : {}),
    });
  }

  async listCloudWatchAlarms(): Promise<readonly CloudWatchAlarmState[]> {
    const data = await this.call<DescribeAlarmsResponse>("DescribeAlarms", {});
    const alarms = data.DescribeAlarmsResponse?.DescribeAlarmsResult?.MetricAlarms ?? [];
    return alarms.map((a) => ({
      alarmName: a.AlarmName,
      alarmArn: a.AlarmArn,
      metricName: a.MetricName,
      namespace: a.Namespace,
      statistic: a.Statistic,
      period: a.Period,
      evaluationPeriods: a.EvaluationPeriods,
      threshold: a.Threshold,
      comparisonOperator: a.ComparisonOperator,
      stateValue: a.StateValue,
    }));
  }

  async deleteCloudWatchAlarm(alarmName: string): Promise<void> {
    await this.call<DeleteAlarmsResponse>("DeleteAlarms", { "AlarmNames.member.1": alarmName });
  }

  async getCloudWatchMetricStatistics(
    namespace: string,
    metricName: string,
    statistic: CloudWatchAlarmConfig["statistic"],
    startTime: string,
    endTime: string,
    period: number
  ): Promise<readonly CloudWatchMetricDatapoint[]> {
    const data = await this.call<GetMetricStatisticsResponse>("GetMetricStatistics", {
      Namespace: namespace,
      MetricName: metricName,
      "Statistics.member.1": statistic,
      StartTime: startTime,
      EndTime: endTime,
      Period: String(period),
    });
    const points = data.GetMetricStatisticsResponse?.GetMetricStatisticsResult?.Datapoints ?? [];
    return points.map((p) => ({
      timestamp: String(p["Timestamp"] ?? ""),
      value: Number(p[statistic] ?? 0),
      unit: String(p["Unit"] ?? "None"),
    }));
  }

  weave(): void {
    // Real no-op - see api/provisioning.ts's CloudProvisioningProvider.weave() comment.
  }
}
