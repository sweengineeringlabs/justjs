import { describe, it, expect } from "bun:test";
import { Window } from "happy-dom";
import { justjs } from "@justjs/application";
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport";

// core/aws_provider.ts's listInstances() uses the browser's native
// global DOMParser to parse EC2's real XML response - real in any
// actual browser, but plain `bun test` has no DOM at all. happy-dom
// (already an established devDependency pattern in this monorepo, see
// scm/examples/ai-code-editor) provides a real DOMParser implementation
// to shim just this one global for the test below - not a mock of this
// package's own logic, only of a Web API this Node-based test runner
// doesn't otherwise have. happy-dom's DOMParser needs a real Window
// behind it (internally references window.XMLDocument), so this uses
// window.DOMParser rather than the bare top-level export.
(globalThis as { DOMParser?: unknown }).DOMParser = new Window().DOMParser;
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import { AwsCloudConnectProvider } from "../core/aws_provider.js";
import { NetlifyCloudConnectProvider } from "../core/netlify_provider.js";
import { VercelCloudConnectProvider } from "../core/vercel_provider.js";
import { HerokuCloudConnectProvider } from "../core/heroku_provider.js";
import { DIGITALOCEAN_PROVIDER } from "../spi/digitalocean.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { TestCloudDashboardAnalyticsProvider } from "../core/test_dashboard_analytics_provider.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";
import { AwsCloudProvisioningProvider } from "../core/aws_cloud_provisioning_provider.js";
import { CloudProvisioningProviderError } from "../api/provisioning.js";

const ALL_STRATEGIES = ["digitalocean", "netlify", "vercel", "heroku", "azure", "gcp", "aws"];
const ALL_DASHBOARD_ANALYTICS_STRATEGIES = ["testcloud"];
const ALL_PROVISIONING_STRATEGIES = ["aws"];

// Constructor-injected fake ApiAdapter, matching @justjs/ai-assist's own
// test harness exactly - zero real network calls in this suite. Also
// queues real post()/put() calls (Netlify's/Vercel's/Heroku's deploy
// flows all need them), tracking method+body alongside url/options so
// the sequencing tests below can assert real call order and shape.
class FakeApiAdapter implements ApiAdapter {
  readonly calls: { method: "get" | "post" | "put"; url: string; body?: unknown; options?: Partial<ApiRequest> }[] = [];
  private readonly responses: Array<() => Promise<ApiResponse<unknown>>> = [];

  queueResponse(fn: () => Promise<ApiResponse<unknown>>): void {
    this.responses.push(fn);
  }

  private async next<T>(): Promise<ApiResponse<T>> {
    const fn = this.responses.shift();
    if (!fn) {
      throw new Error("FakeApiAdapter: no queued response for this call");
    }
    return (await fn()) as ApiResponse<T>;
  }

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "get", url, options });
    return this.next<T>();
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "post", url, body, options });
    return this.next<T>();
  }

  async put<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    this.calls.push({ method: "put", url, body, options });
    return this.next<T>();
  }

  async delete<T = unknown>(): Promise<ApiResponse<T>> {
    throw new Error("FakeApiAdapter.delete() is not exercised by any cloud-connect provider");
  }
}

describe("DefaultCloudConnectProvider", () => {
  it("test_connect_digitalocean_sends_bearer_token_and_parses_real_droplet_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { droplets: [{ id: 123, name: "web-1", status: "active" }] },
    }));
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.digitalocean.com/v2/droplets");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toBe("Bearer tok");
    expect(resources).toEqual([{ id: "123", name: "web-1", status: "active" }]);
  });

  it("test_connect_with_rejected_token_throws_a_real_actionable_error_naming_the_status", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 401, headers: {}, data: undefined, error: "Unauthorized" }));
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/token rejected \(401\)/);
  });

  it("test_connect_with_a_network_failure_throws_without_leaking_the_token", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => {
      throw new Error("fetch failed");
    });
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "super-secret" }, adapter);
    let caught: unknown;
    try {
      await provider.connect();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CloudConnectProviderError);
    expect((caught as Error).message).not.toContain("super-secret");
  });

  // justjs#143 - real local/CI testing seam, verifying both directions:
  // absent env var changes nothing (no regression to real production
  // behavior), present env var redirects the request.
  it("test_connect_hits_the_real_production_url_when_no_endpoint_override_is_set", async () => {
    delete process.env["CLOUD_CONNECT_DIGITALOCEAN_ENDPOINT"];
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { droplets: [] } }));
    const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "tok" }, adapter);
    await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.digitalocean.com/v2/droplets");
  });

  it("test_connect_redirects_to_the_override_url_when_the_endpoint_env_var_is_set", async () => {
    process.env["CLOUD_CONNECT_DIGITALOCEAN_ENDPOINT"] = "http://localhost:4566/v2/droplets";
    try {
      const adapter = new FakeApiAdapter();
      adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { droplets: [] } }));
      const provider = new DefaultCloudConnectProvider(DIGITALOCEAN_PROVIDER, { token: "tok" }, adapter);
      await provider.connect();
      expect(adapter.calls[0]!.url).toBe("http://localhost:4566/v2/droplets");
    } finally {
      delete process.env["CLOUD_CONNECT_DIGITALOCEAN_ENDPOINT"];
    }
  });
});

describe("AwsCloudConnectProvider", () => {
  it("test_connect_calls_get_caller_identity_and_parses_the_real_identity_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        GetCallerIdentityResponse: {
          GetCallerIdentityResult: { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/demo", UserId: "AID..." },
        },
      },
    }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toContain("sts.amazonaws.com");
    expect(adapter.calls[0]!.url).toContain("Action=GetCallerIdentity");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(resources).toEqual([{ id: "123456789012", name: "arn:aws:iam::123456789012:user/demo", status: "identity verified" }]);
  });

  it("test_connect_with_an_aws_error_body_throws_the_real_aws_error_code", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 403,
      headers: {},
      error: "Forbidden",
      data: { Error: { Code: "InvalidClientTokenId", Message: "The security token included in the request is invalid." } },
    }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "bad", secretAccessKey: "bad" }, adapter);
    await expect(provider.connect()).rejects.toThrow(/InvalidClientTokenId/);
  });

  it("test_list_instances_parses_real_ec2_describe_instances_xml", async () => {
    const adapter = new FakeApiAdapter();
    const xml = `<?xml version="1.0"?><DescribeInstancesResponse><reservationSet><item><instancesSet><item><instanceId>i-abc123</instanceId><instanceState><name>running</name></instanceState><tagSet><item><key>Name</key><value>my-box</value></item></tagSet></item></instancesSet></item></reservationSet></DescribeInstancesResponse>`;
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: xml }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const resources = await provider.listInstances!();
    expect(resources).toEqual([{ id: "i-abc123", name: "my-box", status: "running" }]);
  });

  // justjs#143 - real local/CI testing seam for the STS endpoint
  // specifically (the call this session's real CloudEmu verification
  // exercised), verifying both directions.
  it("test_connect_hits_real_sts_when_no_endpoint_override_is_set", async () => {
    delete process.env["CLOUD_CONNECT_AWS_STS_ENDPOINT"];
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { GetCallerIdentityResponse: { GetCallerIdentityResult: { Account: "1", Arn: "a", UserId: "u" } } },
    }));
    const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.connect();
    expect(adapter.calls[0]!.url.startsWith("https://sts.amazonaws.com/")).toBe(true);
  });

  it("test_connect_redirects_to_the_sts_override_when_the_endpoint_env_var_is_set", async () => {
    process.env["CLOUD_CONNECT_AWS_STS_ENDPOINT"] = "http://localhost:4566";
    try {
      const adapter = new FakeApiAdapter();
      adapter.queueResponse(async () => ({
        status: 200,
        headers: {},
        data: { GetCallerIdentityResponse: { GetCallerIdentityResult: { Account: "1", Arn: "a", UserId: "u" } } },
      }));
      const provider = new AwsCloudConnectProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
      await provider.connect();
      expect(adapter.calls[0]!.url.startsWith("http://localhost:4566/")).toBe(true);
      // Signing must stay pinned to the real STS host/region/service even
      // when the destination is redirected - a real signed request still
      // proves the signing logic works, matching this session's live
      // CloudEmu verification (which ignores signatures but still needs a
      // syntactically real one to reach the handler).
      expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/sts/aws4_request");
    } finally {
      delete process.env["CLOUD_CONNECT_AWS_STS_ENDPOINT"];
    }
  });
});

describe("AwsCloudProvisioningProvider (CloudWatch)", () => {
  it("test_put_alarm_sends_the_real_query_protocol_params_as_a_urlencoded_body", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: {} }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.putCloudWatchAlarm!({
      alarmName: "high-cpu",
      metricName: "CPUUtilization",
      namespace: "AWS/EC2",
      statistic: "Average",
      period: 300,
      evaluationPeriods: 2,
      threshold: 80,
      comparisonOperator: "GreaterThanThreshold",
    });
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://monitoring.amazonaws.com/");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=PutMetricAlarm");
    expect(body).toContain("AlarmName=high-cpu");
    expect(body).toContain("Threshold=80");
    expect(body).toContain("ComparisonOperator=GreaterThanThreshold");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/monitoring/aws4_request");
  });

  it("test_list_alarms_parses_the_real_describe_alarms_shape", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        DescribeAlarmsResponse: {
          DescribeAlarmsResult: {
            MetricAlarms: [
              {
                AlarmName: "high-cpu",
                AlarmArn: "arn:aws:cloudwatch:us-east-1:123456789012:alarm:high-cpu",
                MetricName: "CPUUtilization",
                Namespace: "AWS/EC2",
                Statistic: "Average",
                Period: 300,
                EvaluationPeriods: 2,
                Threshold: 80,
                ComparisonOperator: "GreaterThanThreshold",
                StateValue: "OK",
              },
            ],
          },
        },
      },
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const alarms = await provider.listCloudWatchAlarms!();
    expect(alarms).toEqual([
      {
        alarmName: "high-cpu",
        alarmArn: "arn:aws:cloudwatch:us-east-1:123456789012:alarm:high-cpu",
        metricName: "CPUUtilization",
        namespace: "AWS/EC2",
        statistic: "Average",
        period: 300,
        evaluationPeriods: 2,
        threshold: 80,
        comparisonOperator: "GreaterThanThreshold",
        stateValue: "OK",
      },
    ]);
  });

  it("test_list_alarms_returns_an_empty_array_when_none_exist_not_an_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { DescribeAlarmsResponse: { DescribeAlarmsResult: {} } } }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    expect(await provider.listCloudWatchAlarms!()).toEqual([]);
  });

  it("test_delete_alarm_sends_the_real_alarm_name_member_param", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: {} }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.deleteCloudWatchAlarm!("high-cpu");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=DeleteAlarms");
    expect(body).toContain("AlarmNames.member.1=high-cpu");
  });

  it("test_get_metric_statistics_parses_real_datapoints", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: {
        GetMetricStatisticsResponse: {
          GetMetricStatisticsResult: {
            Datapoints: [{ Timestamp: "2026-07-25T00:00:00Z", Average: 42.5, Unit: "Percent" }],
          },
        },
      },
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    const points = await provider.getCloudWatchMetricStatistics!(
      "AWS/EC2",
      "CPUUtilization",
      "Average",
      "2026-07-25T00:00:00Z",
      "2026-07-25T01:00:00Z",
      300
    );
    expect(points).toEqual([{ timestamp: "2026-07-25T00:00:00Z", value: 42.5, unit: "Percent" }]);
  });

  it("test_get_metric_statistics_sends_dimensions_as_real_member_indexed_params_when_provided", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { GetMetricStatisticsResponse: { GetMetricStatisticsResult: { Datapoints: [] } } },
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await provider.getCloudWatchMetricStatistics!(
      "AWS/EC2",
      "CPUUtilization",
      "Average",
      "2026-07-25T00:00:00Z",
      "2026-07-25T01:00:00Z",
      300,
      [{ name: "InstanceId", value: "i-abc123" }]
    );

    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Dimensions.member.1.Name=InstanceId");
    expect(body).toContain("Dimensions.member.1.Value=i-abc123");
  });

  it("test_get_metric_statistics_omits_dimensions_params_entirely_when_none_provided", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { GetMetricStatisticsResponse: { GetMetricStatisticsResult: { Datapoints: [] } } },
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await provider.getCloudWatchMetricStatistics!("AWS/EC2", "CPUUtilization", "Average", "2026-07-25T00:00:00Z", "2026-07-25T01:00:00Z", 300);

    expect(adapter.calls[0]!.body as string).not.toContain("Dimensions");
  });

  it("test_a_real_cloudwatch_error_body_throws_the_real_error_code", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 400,
      headers: {},
      error: "Bad Request",
      data: { Error: { Code: "ResourceNotFound", Message: "Alarm does not exist." } },
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    let caught: unknown;
    try {
      await provider.deleteCloudWatchAlarm!("nonexistent");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CloudProvisioningProviderError);
    expect((caught as Error).message).toContain("ResourceNotFound");
  });

  it("test_redirects_to_the_endpoint_override_when_set", async () => {
    process.env["CLOUD_CONNECT_AWS_CLOUDWATCH_ENDPOINT"] = "http://localhost:4566";
    try {
      const adapter = new FakeApiAdapter();
      adapter.queueResponse(async () => ({ status: 200, headers: {}, data: {} }));
      const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
      await provider.deleteCloudWatchAlarm!("high-cpu");
      expect(adapter.calls[0]!.url).toBe("http://localhost:4566/");
    } finally {
      delete process.env["CLOUD_CONNECT_AWS_CLOUDWATCH_ENDPOINT"];
    }
  });
});

describe("AwsCloudProvisioningProvider (EC2, justjs#144)", () => {
  const RUN_INSTANCES_XML =
    `<?xml version="1.0"?><RunInstancesResponse><requestId>r-1</requestId><reservationId>res-1</reservationId>` +
    `<instancesSet><item><instanceId>i-abc123</instanceId><imageId>ami-mock</imageId><instanceType>t3.micro</instanceType>` +
    `<instanceState><code>16</code><name>running</name></instanceState><privateIpAddress>10.0.0.1</privateIpAddress>` +
    `<ipAddress>54.1.2.3</ipAddress><launchTime>2026-07-25T12:00:00.000Z</launchTime></item></instancesSet></RunInstancesResponse>`;

  it("test_run_instance_sends_the_real_query_protocol_params_and_parses_the_launched_instance", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: RUN_INSTANCES_XML }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    const instance = await provider.runEc2Instance!({ imageId: "ami-mock", instanceType: "t3.micro" });

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://ec2.amazonaws.com/");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=RunInstances");
    expect(body).toContain("ImageId=ami-mock");
    expect(body).toContain("InstanceType=t3.micro");
    expect(body).toContain("MinCount=1");
    expect(body).toContain("MaxCount=1");
    expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/ec2/aws4_request");
    expect(instance).toEqual({
      instanceId: "i-abc123",
      imageId: "ami-mock",
      instanceType: "t3.micro",
      state: "running",
      launchTime: "2026-07-25T12:00:00.000Z",
      privateIpAddress: "10.0.0.1",
      publicIpAddress: "54.1.2.3",
    });
  });

  it("test_run_instance_throws_a_real_actionable_error_when_the_response_has_no_instance_item", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: `<?xml version="1.0"?><RunInstancesResponse></RunInstancesResponse>` }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await expect(provider.runEc2Instance!({ imageId: "ami-mock", instanceType: "t3.micro" })).rejects.toThrow(CloudProvisioningProviderError);
  });

  it("test_list_instances_parses_multiple_reservations_and_instances", async () => {
    const xml =
      `<?xml version="1.0"?><DescribeInstancesResponse><reservationSet>` +
      `<item><instancesSet><item><instanceId>i-1</instanceId><imageId>ami-a</imageId><instanceType>t3.micro</instanceType>` +
      `<instanceState><name>running</name></instanceState><launchTime>t1</launchTime></item></instancesSet></item>` +
      `<item><instancesSet><item><instanceId>i-2</instanceId><imageId>ami-b</imageId><instanceType>t3.small</instanceType>` +
      `<instanceState><name>stopped</name></instanceState><launchTime>t2</launchTime></item></instancesSet></item>` +
      `</reservationSet></DescribeInstancesResponse>`;
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: xml }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    const instances = await provider.listEc2Instances!();

    expect(adapter.calls[0]!.body as string).toContain("Action=DescribeInstances");
    expect(instances).toEqual([
      { instanceId: "i-1", imageId: "ami-a", instanceType: "t3.micro", state: "running", launchTime: "t1", privateIpAddress: undefined, publicIpAddress: undefined },
      { instanceId: "i-2", imageId: "ami-b", instanceType: "t3.small", state: "stopped", launchTime: "t2", privateIpAddress: undefined, publicIpAddress: undefined },
    ]);
  });

  it("test_list_instances_returns_an_empty_array_when_none_exist_not_an_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: `<?xml version="1.0"?><DescribeInstancesResponse><reservationSet/></DescribeInstancesResponse>`,
    }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    expect(await provider.listEc2Instances!()).toEqual([]);
  });

  it("test_start_instance_sends_the_real_instance_id_member_param", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: `<?xml version="1.0"?><StartInstancesResponse/>` }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.startEc2Instance!("i-abc123");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=StartInstances");
    expect(body).toContain("InstanceId.1=i-abc123");
  });

  it("test_stop_instance_sends_the_real_instance_id_member_param", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: `<?xml version="1.0"?><StopInstancesResponse/>` }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.stopEc2Instance!("i-abc123");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=StopInstances");
    expect(body).toContain("InstanceId.1=i-abc123");
  });

  it("test_terminate_instance_sends_the_real_instance_id_member_param", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: `<?xml version="1.0"?><TerminateInstancesResponse/>` }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    await provider.terminateEc2Instance!("i-abc123");
    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("Action=TerminateInstances");
    expect(body).toContain("InstanceId.1=i-abc123");
  });

  it("test_a_real_ec2_error_response_throws_with_the_real_error_code_and_message", async () => {
    const xml =
      `<?xml version="1.0"?><Response><Errors><Error><Code>InvalidInstanceID.NotFound</Code>` +
      `<Message>The instance ID 'i-doesnotexist' does not exist</Message></Error></Errors></Response>`;
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 400, headers: {}, error: "Bad Request", data: xml }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
    let caught: unknown;
    try {
      await provider.terminateEc2Instance!("i-doesnotexist");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CloudProvisioningProviderError);
    expect((caught as Error).message).toContain("InvalidInstanceID.NotFound");
    expect((caught as Error).message).toContain("does not exist");
  });

  it("test_redirects_to_the_ec2_endpoint_override_when_set", async () => {
    process.env["CLOUD_CONNECT_AWS_EC2_ENDPOINT"] = "http://localhost:4566";
    try {
      const adapter = new FakeApiAdapter();
      adapter.queueResponse(async () => ({ status: 200, headers: {}, data: `<?xml version="1.0"?><StopInstancesResponse/>` }));
      const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
      await provider.stopEc2Instance!("i-abc123");
      expect(adapter.calls[0]!.url).toBe("http://localhost:4566/");
      expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/ec2/aws4_request");
    } finally {
      delete process.env["CLOUD_CONNECT_AWS_EC2_ENDPOINT"];
    }
  });

  it("test_run_instance_sends_user_data_base64_encoded_when_provided", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: RUN_INSTANCES_XML }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await provider.runEc2Instance!({ imageId: "ami-mock", instanceType: "t3.micro", userData: "#!/bin/sh\necho hi" });

    const body = adapter.calls[0]!.body as string;
    const params = new URLSearchParams(body);
    expect(params.get("UserData")).toBe(btoa(unescape(encodeURIComponent("#!/bin/sh\necho hi"))));
  });

  it("test_run_instance_omits_user_data_param_entirely_when_not_provided", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: RUN_INSTANCES_XML }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await provider.runEc2Instance!({ imageId: "ami-mock", instanceType: "t3.micro" });

    expect(adapter.calls[0]!.body as string).not.toContain("UserData");
  });

  it("test_run_instance_sends_the_real_iam_instance_profile_name_when_provided", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: RUN_INSTANCES_XML }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await provider.runEc2Instance!({ imageId: "ami-mock", instanceType: "t3.micro", iamInstanceProfileName: "my-ssm-profile" });

    const body = adapter.calls[0]!.body as string;
    expect(body).toContain("IamInstanceProfile.Name=my-ssm-profile");
  });
});

describe("AwsCloudProvisioningProvider (SSM redeploy, ADR-0019)", () => {
  // SSM's real content-type is application/x-amz-json-1.1, not
  // application/json - confirmed live against real AWS this session,
  // which is what caught a real bug: @justjs/transport's ApiAdapter
  // only JSON-parses a body when content-type contains
  // "application/json", so a real SSM response body arrives as an
  // unparsed STRING, not an object like CloudWatch/EC2's own JSON
  // responses. Every response below is a JSON string, not a pre-parsed
  // object, specifically to exercise that real boundary - a fake
  // returning an already-parsed object would have hidden this exact bug.
  function ssmResponse(status: number, body: unknown, error?: string): ApiResponse<unknown> {
    return { status, headers: {}, data: JSON.stringify(body), ...(error !== undefined ? { error } : {}) };
  }

  it("test_run_command_sends_the_real_document_name_and_commands_and_parses_the_command_id", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ssmResponse(200, { Command: { CommandId: "cmd-1" } }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    const result = await provider.runCommandOnEc2Instance!("i-abc123", ["echo hi", "systemctl restart myapp"]);

    expect(result).toEqual({ commandId: "cmd-1" });
    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://ssm.us-east-1.amazonaws.com/");
    expect(adapter.calls[0]!.options?.headers?.["X-Amz-Target"]).toBe("AmazonSSM.SendCommand");
    const body = JSON.parse(adapter.calls[0]!.body as string) as { DocumentName: string; InstanceIds: string[]; Parameters: { commands: string[] } };
    expect(body.DocumentName).toBe("AWS-RunShellScript");
    expect(body.InstanceIds).toEqual(["i-abc123"]);
    expect(body.Parameters.commands).toEqual(["echo hi", "systemctl restart myapp"]);
    expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/ssm/aws4_request");
  });

  it("test_run_command_throws_a_real_actionable_error_when_the_response_has_no_command_id", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ssmResponse(200, {}));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await expect(provider.runCommandOnEc2Instance!("i-abc123", ["echo hi"])).rejects.toThrow(CloudProvisioningProviderError);
  });

  it("test_get_command_status_parses_real_status_and_output", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ssmResponse(200, { Status: "Success", StandardOutputContent: "hi\n", StandardErrorContent: "" }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    const result = await provider.getEc2CommandStatus!("cmd-1", "i-abc123");

    expect(result).toEqual({ status: "Success", output: "hi\n" });
    const body = JSON.parse(adapter.calls[0]!.body as string) as { CommandId: string; InstanceId: string };
    expect(body).toEqual({ CommandId: "cmd-1", InstanceId: "i-abc123" });
    expect(adapter.calls[0]!.options?.headers?.["X-Amz-Target"]).toBe("AmazonSSM.GetCommandInvocation");
  });

  it("test_get_command_status_omits_output_fields_entirely_when_absent_rather_than_empty_strings", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ssmResponse(200, { Status: "Pending" }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    expect(await provider.getEc2CommandStatus!("cmd-1", "i-abc123")).toEqual({ status: "Pending" });
  });

  it("test_a_real_ssm_error_response_throws_with_the_real_type_and_message", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () =>
      ssmResponse(
        400,
        { __type: "InvalidInstanceId", message: "i-doesnotexist is not a valid instance ID or not in a valid state." },
        "Bad Request"
      )
    );
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    let caught: unknown;
    try {
      await provider.runCommandOnEc2Instance!("i-doesnotexist", ["echo hi"]);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CloudProvisioningProviderError);
    expect((caught as Error).message).toContain("InvalidInstanceId");
    expect((caught as Error).message).toContain("not in a valid state");
  });

  it("test_a_real_ssm_error_with_an_empty_body_still_throws_a_real_error_not_a_json_parse_crash", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 403, headers: {}, error: "Forbidden", data: "" }));
    const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);

    await expect(provider.runCommandOnEc2Instance!("i-abc123", ["echo hi"])).rejects.toThrow(CloudProvisioningProviderError);
  });

  it("test_redirects_to_the_ssm_endpoint_override_when_set", async () => {
    process.env["CLOUD_CONNECT_AWS_SSM_ENDPOINT"] = "http://localhost:4566";
    try {
      const adapter = new FakeApiAdapter();
      adapter.queueResponse(async () => ssmResponse(200, { Status: "Success" }));
      const provider = new AwsCloudProvisioningProvider({ accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, adapter);
      await provider.getEc2CommandStatus!("cmd-1", "i-abc123");
      expect(adapter.calls[0]!.url).toBe("http://localhost:4566/");
      expect(adapter.calls[0]!.options?.headers?.Authorization).toContain("us-east-1/ssm/aws4_request");
    } finally {
      delete process.env["CLOUD_CONNECT_AWS_SSM_ENDPOINT"];
    }
  });
});

describe("NetlifyCloudConnectProvider", () => {
  it("test_connect_still_lists_real_sites_same_shape_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: [{ id: "s1", name: "my-site", state: "current" }],
    }));
    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites");
    expect(resources).toEqual([{ id: "s1", name: "my-site", status: "current" }]);
  });

  it("test_deploy_does_the_real_create_manifest_upload_poll_sequence", async () => {
    // The `required` array must contain this file's own real SHA-1 (not
    // an arbitrary placeholder) - Netlify's real API tells the caller
    // exactly which hashes it doesn't already have, and deploy() only
    // uploads files whose hash is actually in that set.
    const realHash = Buffer.from(await crypto.subtle.digest("SHA-1", new TextEncoder().encode("<h1>hi</h1>"))).toString("hex");
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "site-1", url: "http://my-site.netlify.app", ssl_url: "https://my-site.netlify.app" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-1", required: [realHash] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: {} }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-1", state: "ready", ssl_url: "https://my-site.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }]);

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites");
    expect(adapter.calls[1]!.method).toBe("post");
    expect(adapter.calls[1]!.url).toBe("https://api.netlify.com/api/v1/sites/site-1/deploys");
    expect((adapter.calls[1]!.body as { files: Record<string, string> }).files["/index.html"]).toMatch(/^[0-9a-f]{40}$/);
    expect(adapter.calls[2]!.method).toBe("put");
    expect(adapter.calls[2]!.url).toBe("https://api.netlify.com/api/v1/deploys/deploy-1/files/index.html");
    expect(adapter.calls[2]!.body).toBe("<h1>hi</h1>");
    expect(adapter.calls[3]!.method).toBe("get");
    expect(adapter.calls[3]!.url).toBe("https://api.netlify.com/api/v1/deploys/deploy-1");
    expect(result).toEqual({ url: "https://my-site.netlify.app", targetId: "site-1" });
  });

  it("test_deploy_hashes_file_content_with_the_real_known_sha1_test_vector", async () => {
    // SHA1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d is a
    // well-known, independently-verifiable test vector (not derived
    // from this package's own code) - a real regression guard on
    // core/netlify_provider.ts's sha1Hex(), same cross-check spirit as
    // this package's own SigV4 independent-implementation test.
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-3", required: [] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-3", state: "ready", url: "http://x.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    await provider.deploy([{ path: "greeting.txt", content: "hello" }], "site-x");

    const manifest = (adapter.calls[0]!.body as { files: Record<string, string> }).files;
    expect(manifest["/greeting.txt"]).toBe("aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
  });

  it("test_deploy_reuses_the_given_existing_target_id_instead_of_creating_a_new_site", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-2", required: [] } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "deploy-2", state: "ready", url: "http://existing-site.netlify.app" } }));

    const provider = new NetlifyCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "hi" }], "existing-site-id");

    expect(adapter.calls[0]!.url).toBe("https://api.netlify.com/api/v1/sites/existing-site-id/deploys");
    expect(result.targetId).toBe("existing-site-id");
  });
});

describe("VercelCloudConnectProvider", () => {
  it("test_connect_still_parses_the_real_deployed_status_shape_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({
      status: 200,
      headers: {},
      data: { projects: [{ id: "p1", name: "deployed-app", targets: { production: {} } }] },
    }));
    const provider = new VercelCloudConnectProvider({ token: "tok" }, adapter);
    const resources = await provider.connect();
    expect(resources).toEqual([{ id: "p1", name: "deployed-app", status: "deployed" }]);
  });

  it("test_deploy_inlines_base64_file_contents_in_one_post_and_polls_until_ready", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "dpl_1", url: "my-app-abc123.vercel.app", readyState: "QUEUED" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "dpl_1", url: "my-app-abc123.vercel.app", readyState: "READY" } }));

    const provider = new VercelCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }], "my-project");

    expect(adapter.calls[0]!.method).toBe("post");
    expect(adapter.calls[0]!.url).toBe("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1");
    const body = adapter.calls[0]!.body as { name: string; files: Array<{ file: string; data: string; encoding: string }> };
    expect(body.name).toBe("my-project");
    expect(body.files[0]!.encoding).toBe("base64");
    expect(atob(body.files[0]!.data)).toBe("<h1>hi</h1>");
    expect(adapter.calls[1]!.method).toBe("get");
    expect(adapter.calls[1]!.url).toBe("https://api.vercel.com/v13/deployments/dpl_1");
    expect(result).toEqual({ url: "https://my-app-abc123.vercel.app", targetId: "my-project" });
  });
});

describe("HerokuCloudConnectProvider", () => {
  it("test_connect_still_sends_the_required_accept_header_as_before_the_deploy_refactor", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: [] }));
    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    await provider.connect();
    expect(adapter.calls[0]!.options?.headers?.Accept).toBe("application/vnd.heroku+json; version=3");
  });

  it("test_deploy_does_the_real_app_sources_upload_build_poll_sequence", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "app-1", web_url: "https://app-1.herokuapp.com/" } })); // create app
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { source_blob: { get_url: "https://s3/get", put_url: "https://s3/put" } } })); // sources
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: undefined })); // PUT tarball
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "pending" } })); // create build
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "succeeded" } })); // poll build
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "app-1", web_url: "https://app-1.herokuapp.com/" } })); // get app for final URL

    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    const result = await provider.deploy([{ path: "index.html", content: "<h1>hi</h1>" }]);

    expect(adapter.calls[0]!.url).toBe("https://api.heroku.com/apps");
    expect(adapter.calls[1]!.url).toBe("https://api.heroku.com/apps/app-1/sources");
    expect(adapter.calls[2]!.method).toBe("put");
    expect(adapter.calls[2]!.url).toBe("https://s3/put");
    expect(adapter.calls[2]!.body).toBeInstanceOf(Uint8Array);
    expect(adapter.calls[3]!.url).toBe("https://api.heroku.com/apps/app-1/builds");
    expect((adapter.calls[3]!.body as { source_blob: { url: string } }).source_blob.url).toBe("https://s3/get");
    expect(adapter.calls[4]!.url).toBe("https://api.heroku.com/apps/app-1/builds/build-1");
    expect(result).toEqual({ url: "https://app-1.herokuapp.com/", targetId: "app-1" });
  });

  it("test_deploy_with_a_failed_build_throws_a_real_actionable_error", async () => {
    const adapter = new FakeApiAdapter();
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { source_blob: { get_url: "https://s3/get", put_url: "https://s3/put" } } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: undefined }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "pending" } }));
    adapter.queueResponse(async () => ({ status: 200, headers: {}, data: { id: "build-1", status: "failed" } }));

    const provider = new HerokuCloudConnectProvider({ token: "tok" }, adapter);
    await expect(provider.deploy([{ path: "index.html", content: "hi" }], "existing-app-id")).rejects.toThrow(/real failure/);
  });
});

describe("TestCloudDashboardAnalyticsProvider", () => {
  it("test_fetch_analytics_with_no_token_returns_canned_metrics_trending_and_activity", async () => {
    const provider = new TestCloudDashboardAnalyticsProvider({});
    const snapshot = await provider.fetchAnalytics();
    expect(snapshot.metrics.length).toBeGreaterThan(0);
    expect(snapshot.metrics.every((m) => typeof m.label === "string" && typeof m.count === "number")).toBe(true);
    expect(snapshot.trending.length).toBeGreaterThan(0);
    expect(snapshot.recentActivity.length).toBeGreaterThan(0);
  });

  it("test_each_metrics_item_count_matches_its_own_items_length", async () => {
    const provider = new TestCloudDashboardAnalyticsProvider({});
    const snapshot = await provider.fetchAnalytics();
    for (const metric of snapshot.metrics) {
      expect(metric.items.length).toBe(metric.count);
    }
  });

  it("test_fetch_analytics_with_a_token_containing_fail_simulates_a_real_rejected_call", async () => {
    const provider = new TestCloudDashboardAnalyticsProvider({ token: "please-fail" });
    await expect(provider.fetchAnalytics()).rejects.toThrow(DashboardAnalyticsProviderError);
    await expect(provider.fetchAnalytics()).rejects.toThrow(/simulated failure/);
  });
});

describe("cloud-connect SPI self-registration", () => {
  it("test_every_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_STRATEGIES) {
      const resolved = justjs.providers.resolve("cloudConnect", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("cloudConnect");
      expect(resolved!.strategy).toBe(strategy);
    }
  });

  it("test_every_dashboard_analytics_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_DASHBOARD_ANALYTICS_STRATEGIES) {
      const resolved = justjs.providers.resolve("dashboardAnalytics", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("dashboardAnalytics");
      expect(resolved!.strategy).toBe(strategy);
    }
  });

  it("test_every_provisioning_strategy_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    for (const strategy of ALL_PROVISIONING_STRATEGIES) {
      const resolved = justjs.providers.resolve("cloudProvisioning", strategy);
      expect(resolved).not.toBeNull();
      expect(resolved!.concern).toBe("cloudProvisioning");
      expect(resolved!.strategy).toBe(strategy);
    }
  });
});
