import type { ApiAdapter } from "@justjs/transport";
import type { AwsCredentialsConfig } from "../api/provider.js";
import type {
  CloudProvisioningProvider,
  CloudWatchAlarmConfig,
  CloudWatchAlarmState,
  CloudWatchDimension,
  CloudWatchMetricDatapoint,
  Ec2CommandResult,
  Ec2CommandStatus,
  Ec2InstanceConfig,
  Ec2InstanceState,
  EcsClusterState,
  EcsTaskDefinitionConfig,
  EcsTaskDefinitionState,
  EcsTaskState,
} from "../api/provisioning.js";
import { CloudProvisioningProviderError } from "../api/provisioning.js";
import { signAwsRequest } from "@justjs/aws-sigv4";

const REGION = "us-east-1";
const CLOUDWATCH_SERVICE = "monitoring";
const EC2_SERVICE = "ec2";
const SSM_SERVICE = "ssm";
const SSM_DOCUMENT_NAME = "AWS-RunShellScript";
const ECS_SERVICE = "ecs";

// Real local/CI testing seam (justjs#143, extended by justjs#148 for a
// real in-browser override - see aws_provider.ts's own comment on this
// exact function for the full reasoning, duplicated per-file rather
// than shared, same as the rest of this pattern already is).
function endpointOverride(envVar: string, realUrl: string): string {
  if (typeof process !== "undefined" && process.env[envVar]) {
    return process.env[envVar]!;
  }
  try {
    const stored = globalThis.localStorage?.getItem(`justjs:aws-endpoint-override:${envVar}`);
    if (stored) {
      return stored;
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as
    // cloud_credentials.ts's own localStorage helpers.
  }
  return realUrl;
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
// extension, since moved into @justjs/aws-sigv4). Confirmed against
// AWS's own published CloudWatch API reference, not yet live-verified
// against a real AWS account (unlike STS/EC2 in aws_provider.ts, which
// this session did verify live) - flagged honestly, not silently
// assumed equivalent.
function encodeParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function xmlText(el: Element | Document, tag: string): string | undefined {
  return el.getElementsByTagName(tag)[0]?.textContent ?? undefined;
}

// Same UTF-8-safe base64 idiom vercel_provider.ts's own
// base64EncodeUtf8() already established for this repo - a bare
// btoa() throws on multi-byte characters, this is the standard,
// documented JS workaround, no library.
function base64EncodeUtf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

// SSM's real error shape (AWS JSON 1.1 protocol, same family
// DynamoDB/other JSON-protocol AWS services use) - a flat
// {__type, message}, not CloudWatch/EC2's own Error.Code/Message or
// query-protocol XML shape. Confirmed against AWS's own published SSM
// API reference; live-verified below (see the int test suite) against
// real AWS with deliberately-invalid credentials, the same "correctly-
// formed request, rejected credentials" signature already confirmed for
// STS/CloudWatch/EC2/Bedrock this session.
interface SsmErrorResponse {
  readonly __type?: string;
  readonly message?: string;
  readonly Message?: string;
}

interface SendCommandResponse extends SsmErrorResponse {
  readonly Command?: { readonly CommandId: string };
}

interface GetCommandInvocationResponse extends SsmErrorResponse {
  readonly Status?: string;
  readonly StandardOutputContent?: string;
  readonly StandardErrorContent?: string;
}

// ECS is also a JSON-protocol service (X-Amz-Target-based, same family
// as SSM above) - confirmed against CloudEmu's own real handler
// (services/ecs/handlers.rs), which deliberately builds a flat
// {__type, message} error body rather than the shared XML ApiError type
// other AWS services here use, specifically because the JSON-protocol
// Go/JS SDKs can't parse XML errors. Matches AWS's own published ECS API
// reference for this same reason.
interface EcsErrorResponse {
  readonly __type?: string;
  readonly message?: string;
  readonly Message?: string;
}

interface EcsClusterWire {
  readonly clusterName: string;
  readonly clusterArn: string;
  readonly status: string;
}

interface EcsTaskWire {
  readonly taskArn: string;
  readonly clusterArn: string;
  readonly taskDefinitionArn: string;
  readonly lastStatus: string;
  readonly desiredStatus: string;
}

interface EcsTaskDefinitionWire {
  readonly family: string;
  readonly taskDefinitionArn: string;
  readonly revision: number;
  readonly status: string;
}

interface CreateClusterResponse extends EcsErrorResponse {
  readonly cluster?: EcsClusterWire;
}

interface ListClustersResponse extends EcsErrorResponse {
  readonly clusterArns?: readonly string[];
}

interface DescribeClustersResponse extends EcsErrorResponse {
  readonly clusters?: readonly EcsClusterWire[];
}

interface DeleteClusterResponse extends EcsErrorResponse {
  readonly cluster?: EcsClusterWire;
}

interface RegisterTaskDefinitionResponse extends EcsErrorResponse {
  readonly taskDefinition?: EcsTaskDefinitionWire;
}

interface RunTaskResponse extends EcsErrorResponse {
  readonly tasks?: readonly EcsTaskWire[];
}

interface StopTaskResponse extends EcsErrorResponse {
  readonly task?: EcsTaskWire;
}

interface ListTasksResponse extends EcsErrorResponse {
  readonly taskArns?: readonly string[];
}

interface DescribeTasksResponse extends EcsErrorResponse {
  readonly tasks?: readonly EcsTaskWire[];
}

// Real AWS/EC2/CloudWatch provisioning - the AWS "aws" strategy for the
// cloudProvisioning concern. CloudWatch shipped first (justjs#139/
// ADR-0017's pilot): the one AWS service here with zero cost and zero
// irreversible action even against a real account (an alarm is free and
// instantly deletable). EC2 (justjs#144) is the second, real, billable
// method group - RunInstances never ships without TerminateInstances
// (this file implements both together, not across separate commits).
// One class, not two, because only one factory can be registered per
// (concern, strategy) pair in the SPI registry (justjs.providers) - see
// spi/aws_cloud_provisioning.ts.
export class AwsCloudProvisioningProvider implements CloudProvisioningProvider {
  readonly concern = "cloudProvisioning" as const;
  readonly strategy = "aws";

  constructor(
    private readonly config: AwsCredentialsConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  private async cloudWatchCall<T extends CloudWatchErrorResponse>(action: string, params: Record<string, string>): Promise<T> {
    const body = encodeParams({ Action: action, Version: "2010-08-01", ...params });
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: CLOUDWATCH_SERVICE,
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
    await this.cloudWatchCall<PutMetricAlarmResponse>("PutMetricAlarm", {
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
    const data = await this.cloudWatchCall<DescribeAlarmsResponse>("DescribeAlarms", {});
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
    await this.cloudWatchCall<DeleteAlarmsResponse>("DeleteAlarms", { "AlarmNames.member.1": alarmName });
  }

  async getCloudWatchMetricStatistics(
    namespace: string,
    metricName: string,
    statistic: CloudWatchAlarmConfig["statistic"],
    startTime: string,
    endTime: string,
    period: number,
    dimensions?: readonly CloudWatchDimension[]
  ): Promise<readonly CloudWatchMetricDatapoint[]> {
    const dimensionParams: Record<string, string> = {};
    (dimensions ?? []).forEach((d, i) => {
      dimensionParams[`Dimensions.member.${i + 1}.Name`] = d.name;
      dimensionParams[`Dimensions.member.${i + 1}.Value`] = d.value;
    });
    const data = await this.cloudWatchCall<GetMetricStatisticsResponse>("GetMetricStatistics", {
      Namespace: namespace,
      MetricName: metricName,
      "Statistics.member.1": statistic,
      StartTime: startTime,
      EndTime: endTime,
      Period: String(period),
      ...dimensionParams,
    });
    const points = data.GetMetricStatisticsResponse?.GetMetricStatisticsResult?.Datapoints ?? [];
    return points.map((p) => ({
      timestamp: String(p["Timestamp"] ?? ""),
      value: Number(p[statistic] ?? 0),
      unit: String(p["Unit"] ?? "None"),
    }));
  }

  // EC2's classic Query API does not honor Accept: application/json
  // (confirmed live against real AWS in aws_provider.ts's listInstances(),
  // and again this session against CloudEmu's own EC2 fix) - always
  // returns XML regardless of the Accept header sent, so every EC2 call
  // here parses the real XML response via DOMParser rather than assuming
  // JSON. @justjs/transport's ApiAdapter already returns the raw body
  // string as `data` for any non-JSON content-type.
  private async ec2Call(action: string, params: Record<string, string> = {}): Promise<Document> {
    const body = encodeParams({ Action: action, Version: "2016-11-15", ...params });
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: EC2_SERVICE,
      method: "POST",
      host: "ec2.amazonaws.com",
      path: "/",
      query: "",
      body,
      extraHeaders: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_EC2_ENDPOINT", "https://ec2.amazonaws.com");
    const response = await this.apiAdapter.post<string>(endpoint + "/", body, { headers });
    const doc = new DOMParser().parseFromString(response.data, "text/xml");
    if (response.error) {
      const message = doc.getElementsByTagName("Message")[0]?.textContent ?? response.error;
      const code = doc.getElementsByTagName("Code")[0]?.textContent ?? String(response.status);
      throw new CloudProvisioningProviderError("AWS_ERROR", `EC2: ${code} - ${message} (action ${action}).`);
    }
    return doc;
  }

  private parseInstanceItem(item: Element): Ec2InstanceState {
    const privateIpAddress = xmlText(item, "privateIpAddress");
    const publicIpAddress = xmlText(item, "ipAddress");
    return {
      instanceId: xmlText(item, "instanceId") ?? "",
      imageId: xmlText(item, "imageId") ?? "",
      instanceType: xmlText(item, "instanceType") ?? "",
      state: item.getElementsByTagName("instanceState")[0]?.getElementsByTagName("name")[0]?.textContent ?? "unknown",
      launchTime: xmlText(item, "launchTime") ?? "",
      ...(privateIpAddress !== undefined ? { privateIpAddress } : {}),
      ...(publicIpAddress !== undefined ? { publicIpAddress } : {}),
    };
  }

  async runEc2Instance(config: Ec2InstanceConfig): Promise<Ec2InstanceState> {
    const doc = await this.ec2Call("RunInstances", {
      ImageId: config.imageId,
      InstanceType: config.instanceType,
      MinCount: "1",
      MaxCount: "1",
      ...(config.keyName !== undefined ? { KeyName: config.keyName } : {}),
      ...(config.subnetId !== undefined ? { SubnetId: config.subnetId } : {}),
      // ADR-0019 Option A - RunInstances' own real UserData param is
      // base64, unlike every other EC2 param here (plain query-protocol
      // strings) - AWS's documented exception for this one field.
      ...(config.userData !== undefined ? { UserData: base64EncodeUtf8(config.userData) } : {}),
      // ADR-0019 Option B, opt-in only - this app never creates the
      // profile named here, it only ever references one the user
      // already made (see ADR-0019's IAM policy).
      ...(config.iamInstanceProfileName !== undefined ? { "IamInstanceProfile.Name": config.iamInstanceProfileName } : {}),
    });
    const item = doc.getElementsByTagName("instancesSet")[0]?.getElementsByTagName("item")[0];
    if (!item) {
      throw new CloudProvisioningProviderError("AWS_UNEXPECTED_RESPONSE", "EC2: RunInstances returned an unexpected response shape.");
    }
    return this.parseInstanceItem(item);
  }

  async listEc2Instances(): Promise<readonly Ec2InstanceState[]> {
    const doc = await this.ec2Call("DescribeInstances");
    return Array.from(doc.getElementsByTagName("instancesSet"))
      .flatMap((set) => Array.from(set.getElementsByTagName("item")))
      .map((item) => this.parseInstanceItem(item));
  }

  async startEc2Instance(instanceId: string): Promise<void> {
    await this.ec2Call("StartInstances", { "InstanceId.1": instanceId });
  }

  async stopEc2Instance(instanceId: string): Promise<void> {
    await this.ec2Call("StopInstances", { "InstanceId.1": instanceId });
  }

  async terminateEc2Instance(instanceId: string): Promise<void> {
    await this.ec2Call("TerminateInstances", { "InstanceId.1": instanceId });
  }

  // SSM is a JSON-protocol service (X-Amz-Target-based), same shape
  // @justjs/ai-assist's BedrockAiAssistProvider already uses for
  // Bedrock - not query-protocol+XML like EC2/CloudWatch above. Real
  // only for instances the caller already opted into via
  // Ec2InstanceConfig.iamInstanceProfileName at launch (ADR-0019) - this
  // method never checks that client-side, AWS's own real error (e.g.
  // "instance ... is not in a valid state for account" /
  // "TargetNotConnected") surfaces for any instance that isn't actually
  // SSM-managed.
  private async ssmCall<T extends SsmErrorResponse>(action: string, body: Record<string, unknown>): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: SSM_SERVICE,
      method: "POST",
      host: `ssm.${REGION}.amazonaws.com`,
      path: "/",
      query: "",
      body: bodyStr,
      extraHeaders: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AmazonSSM.${action}` },
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_SSM_ENDPOINT", `https://ssm.${REGION}.amazonaws.com`);
    const response = await this.apiAdapter.post<T | string>(endpoint + "/", bodyStr, { headers });
    // SSM's real content-type is application/x-amz-json-1.1, not
    // application/json - @justjs/transport's ApiAdapter only JSON-
    // parses bodies whose content-type contains "application/json"
    // (confirmed live: a real AWS SSM error response arrived here as an
    // unparsed string, not the object every other JSON-protocol call in
    // this file/this session got automatically), so this parses it by
    // hand when the adapter didn't already.
    const data: T = typeof response.data === "string" ? (response.data.length > 0 ? JSON.parse(response.data) : ({} as T)) : response.data;
    if (response.error !== undefined) {
      const message = data.message ?? data.Message ?? response.error;
      const code = data.__type ?? `HTTP_${response.status}`;
      throw new CloudProvisioningProviderError(code, `SSM: ${code} - ${message} (action ${action}).`);
    }
    return data;
  }

  async runCommandOnEc2Instance(instanceId: string, commands: readonly string[]): Promise<Ec2CommandResult> {
    const data = await this.ssmCall<SendCommandResponse>("SendCommand", {
      DocumentName: SSM_DOCUMENT_NAME,
      InstanceIds: [instanceId],
      Parameters: { commands },
    });
    if (!data.Command?.CommandId) {
      throw new CloudProvisioningProviderError("AWS_UNEXPECTED_RESPONSE", "SSM: SendCommand returned an unexpected response shape.");
    }
    return { commandId: data.Command.CommandId };
  }

  async getEc2CommandStatus(commandId: string, instanceId: string): Promise<Ec2CommandStatus> {
    const data = await this.ssmCall<GetCommandInvocationResponse>("GetCommandInvocation", {
      CommandId: commandId,
      InstanceId: instanceId,
    });
    return {
      status: data.Status ?? "Unknown",
      ...(data.StandardOutputContent ? { output: data.StandardOutputContent } : {}),
      ...(data.StandardErrorContent ? { errorOutput: data.StandardErrorContent } : {}),
    };
  }

  // Same JSON-protocol shape as ssmCall() above - ECS uses the identical
  // X-Amz-Target/application/x-amz-json-1.1 convention, just its own
  // service name/host/error vocabulary. Not merged into one shared
  // generic helper: the two services' error shapes differ just enough
  // (SSM's __type is always populated on error; ECS's own real errors
  // via CloudEmu use the same field but this hasn't been live-verified
  // against real AWS ECS yet, unlike SSM which was) that keeping them
  // separate makes that distinction visible rather than hidden behind a
  // shared abstraction two services don't quite agree on.
  private async ecsCall<T extends EcsErrorResponse>(action: string, body: Record<string, unknown>): Promise<T> {
    const bodyStr = JSON.stringify(body);
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: ECS_SERVICE,
      method: "POST",
      host: `ecs.${REGION}.amazonaws.com`,
      path: "/",
      query: "",
      body: bodyStr,
      extraHeaders: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": `AmazonEC2ContainerServiceV20141113.${action}` },
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_ECS_ENDPOINT", `https://ecs.${REGION}.amazonaws.com`);
    const response = await this.apiAdapter.post<T | string>(endpoint + "/", bodyStr, { headers });
    // Same real-content-type caveat ssmCall() above already documents -
    // ECS's application/x-amz-json-1.1 isn't recognized as JSON by
    // @justjs/transport's ApiAdapter, so an error body can arrive
    // unparsed.
    const data: T = typeof response.data === "string" ? (response.data.length > 0 ? JSON.parse(response.data) : ({} as T)) : response.data;
    if (response.error !== undefined) {
      const message = data.message ?? data.Message ?? response.error;
      const code = data.__type ?? `HTTP_${response.status}`;
      throw new CloudProvisioningProviderError(code, `ECS: ${code} - ${message} (action ${action}).`);
    }
    return data;
  }

  private toClusterState(c: EcsClusterWire): EcsClusterState {
    return { clusterName: c.clusterName, clusterArn: c.clusterArn, status: c.status };
  }

  private toTaskState(t: EcsTaskWire): EcsTaskState {
    return {
      taskArn: t.taskArn,
      clusterArn: t.clusterArn,
      taskDefinitionArn: t.taskDefinitionArn,
      lastStatus: t.lastStatus,
      desiredStatus: t.desiredStatus,
    };
  }

  async createEcsCluster(clusterName: string): Promise<EcsClusterState> {
    const data = await this.ecsCall<CreateClusterResponse>("CreateCluster", { clusterName });
    if (!data.cluster) {
      throw new CloudProvisioningProviderError("AWS_UNEXPECTED_RESPONSE", "ECS: CreateCluster returned an unexpected response shape.");
    }
    return this.toClusterState(data.cluster);
  }

  async listEcsClusters(): Promise<readonly EcsClusterState[]> {
    const arns = await this.ecsCall<ListClustersResponse>("ListClusters", {});
    const clusterArns = arns.clusterArns ?? [];
    if (clusterArns.length === 0) {
      return [];
    }
    const data = await this.ecsCall<DescribeClustersResponse>("DescribeClusters", { clusters: clusterArns });
    return (data.clusters ?? []).map((c) => this.toClusterState(c));
  }

  async deleteEcsCluster(clusterName: string): Promise<void> {
    await this.ecsCall<DeleteClusterResponse>("DeleteCluster", { cluster: clusterName });
  }

  async registerEcsTaskDefinition(config: EcsTaskDefinitionConfig): Promise<EcsTaskDefinitionState> {
    const data = await this.ecsCall<RegisterTaskDefinitionResponse>("RegisterTaskDefinition", {
      family: config.family,
      containerDefinitions: config.containerDefinitions.map((c) => ({
        name: c.name,
        image: c.image,
        ...(c.cpu !== undefined ? { cpu: c.cpu } : {}),
        ...(c.memory !== undefined ? { memory: c.memory } : {}),
        ...(c.portMappings !== undefined
          ? {
              portMappings: c.portMappings.map((p) => ({
                containerPort: p.containerPort,
                hostPort: p.hostPort,
                protocol: p.protocol ?? "tcp",
              })),
            }
          : {}),
      })),
      ...(config.cpu !== undefined ? { cpu: config.cpu } : {}),
      ...(config.memory !== undefined ? { memory: config.memory } : {}),
      requiresCompatibilities: ["FARGATE"],
      networkMode: "awsvpc",
    });
    if (!data.taskDefinition) {
      throw new CloudProvisioningProviderError("AWS_UNEXPECTED_RESPONSE", "ECS: RegisterTaskDefinition returned an unexpected response shape.");
    }
    return {
      family: data.taskDefinition.family,
      taskDefinitionArn: data.taskDefinition.taskDefinitionArn,
      revision: data.taskDefinition.revision,
      status: data.taskDefinition.status,
    };
  }

  async deregisterEcsTaskDefinition(taskDefinitionArn: string): Promise<void> {
    await this.ecsCall<EcsErrorResponse>("DeregisterTaskDefinition", { taskDefinition: taskDefinitionArn });
  }

  async runEcsTask(clusterName: string, taskDefinitionArn: string, count?: number): Promise<readonly EcsTaskState[]> {
    const data = await this.ecsCall<RunTaskResponse>("RunTask", {
      cluster: clusterName,
      taskDefinition: taskDefinitionArn,
      count: count ?? 1,
    });
    return (data.tasks ?? []).map((t) => this.toTaskState(t));
  }

  async listEcsTasks(clusterName: string): Promise<readonly EcsTaskState[]> {
    const arns = await this.ecsCall<ListTasksResponse>("ListTasks", { cluster: clusterName });
    const taskArns = arns.taskArns ?? [];
    if (taskArns.length === 0) {
      return [];
    }
    const data = await this.ecsCall<DescribeTasksResponse>("DescribeTasks", { cluster: clusterName, tasks: taskArns });
    return (data.tasks ?? []).map((t) => this.toTaskState(t));
  }

  async stopEcsTask(clusterName: string, taskArn: string): Promise<void> {
    await this.ecsCall<StopTaskResponse>("StopTask", { cluster: clusterName, task: taskArn });
  }

  weave(): void {
    // Real no-op - see api/provisioning.ts's CloudProvisioningProvider.weave() comment.
  }
}
