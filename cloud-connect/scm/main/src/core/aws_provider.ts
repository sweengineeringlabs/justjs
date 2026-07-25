import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, AwsCredentialsConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { signAwsRequest } from "./aws_sigv4.js";

const REGION = "us-east-1";

// Real local/CI testing seam (justjs#143) - overrides only the request's
// destination URL, never the signing host/region/service, so a real
// signed request still targets whatever's actually listening at the
// override (e.g. CloudEmu, which ignores SigV4 entirely) without
// changing what gets signed. Absent in production - these env vars are
// read once at construction, Node/bun-process-level only, never bundled
// into the browser app itself (ai-code-editor never sets them).
function endpointOverride(envVar: string, realUrl: string): string {
  return typeof process !== "undefined" ? (process.env[envVar] ?? realUrl) : realUrl;
}

interface GetCallerIdentityResponse {
  readonly GetCallerIdentityResponse?: {
    readonly GetCallerIdentityResult?: { readonly Account: string; readonly Arn: string; readonly UserId: string };
  };
  readonly Error?: { readonly Code: string; readonly Message: string };
}

// AWS - the one strategy needing real request signing (SigV4) instead
// of a plain bearer token, since AWS's own docs are explicit that CORS
// support doesn't remove the signing requirement. connect() always
// calls STS GetCallerIdentity - AWS's own docs: "No permissions are
// required to perform this operation" - the safest possible proof a
// key pair works. listInstances() (EC2 DescribeInstances) is a
// separate, higher-privilege, opt-in call - see api/provider.ts.
export class AwsCloudConnectProvider implements CloudConnectProvider {
  readonly concern = "cloudConnect" as const;
  readonly strategy = "aws";

  constructor(
    private readonly config: AwsCredentialsConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<CloudResource[]> {
    const query = "Action=GetCallerIdentity&Version=2011-06-15";
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: "sts",
      method: "GET",
      host: "sts.amazonaws.com",
      path: "/",
      query,
      extraHeaders: { Accept: "application/json" },
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_STS_ENDPOINT", "https://sts.amazonaws.com");
    const response = await this.apiAdapter.get<GetCallerIdentityResponse>(`${endpoint}/?${query}`, {
      headers,
    });
    if (response.data.Error) {
      throw new CloudConnectProviderError("AWS_ERROR", `AWS: ${response.data.Error.Code} - ${response.data.Error.Message}`);
    }
    const result = response.data.GetCallerIdentityResponse?.GetCallerIdentityResult;
    if (!result) {
      throw new CloudConnectProviderError("AWS_UNEXPECTED_RESPONSE", "AWS: GetCallerIdentity returned an unexpected response shape.");
    }
    return [{ id: result.Account, name: result.Arn, status: "identity verified" }];
  }

  // EC2's classic Query API does not honor Accept: application/json
  // (confirmed live: always returns XML regardless of the Accept header
  // sent), so this parses the real XML response via DOMParser rather
  // than assuming JSON - @justjs/transport's ApiAdapter already returns
  // the raw body string as `data` for any non-JSON content-type.
  async listInstances(): Promise<CloudResource[]> {
    const query = "Action=DescribeInstances&Version=2016-11-15";
    const headers = await signAwsRequest({
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      region: REGION,
      service: "ec2",
      method: "GET",
      host: "ec2.amazonaws.com",
      path: "/",
      query,
    });
    const endpoint = endpointOverride("CLOUD_CONNECT_AWS_EC2_ENDPOINT", "https://ec2.amazonaws.com");
    const response = await this.apiAdapter.get<string>(`${endpoint}/?${query}`, { headers });
    const doc = new DOMParser().parseFromString(response.data, "text/xml");
    if (response.error) {
      const message = doc.getElementsByTagName("Message")[0]?.textContent ?? response.error;
      const code = doc.getElementsByTagName("Code")[0]?.textContent ?? String(response.status);
      throw new CloudConnectProviderError(
        "AWS_ERROR",
        `AWS: ${code} - ${message} (DescribeInstances needs the ec2:DescribeInstances permission).`
      );
    }
    const instances: CloudResource[] = [];
    for (const item of Array.from(doc.getElementsByTagName("instancesSet")).flatMap((set) =>
      Array.from(set.getElementsByTagName("item"))
    )) {
      const id = item.getElementsByTagName("instanceId")[0]?.textContent ?? "";
      const state = item.getElementsByTagName("instanceState")[0]?.getElementsByTagName("name")[0]?.textContent ?? "unknown";
      const nameTag = Array.from(item.getElementsByTagName("item")).find(
        (tag) => tag.getElementsByTagName("key")[0]?.textContent === "Name"
      );
      const name = nameTag?.getElementsByTagName("value")[0]?.textContent || id;
      if (id) {
        instances.push({ id, name, status: state });
      }
    }
    return instances;
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CloudConnectProvider.weave() comment.
  }
}
