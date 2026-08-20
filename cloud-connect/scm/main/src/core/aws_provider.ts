import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, AwsCredentialsConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { signAwsRequest } from "@justjs/aws-sigv4";

const REGION = "us-east-1";

// Real local/CI testing seam (justjs#143, extended by justjs#148) -
// overrides only the request's destination URL, never the signing
// host/region/service, so a real signed request still targets whatever
// actually listening at the override (e.g. CloudEmu, which ignores
// SigV4 entirely) without changing what gets signed.
//
// Two independent seams, checked in order:
// 1. `process.env[envVar]` - Node/bun-process-level only, genuinely
//    absent from any real browser bundle (this was the only mechanism
//    before justjs#148, and every standalone-script verification this
//    session used it).
// 2. `localStorage["justjs:aws-endpoint-override:<envVar>"]` -
//    justjs#148's real addition: the first mechanism this app's actual
//    running UI (dev server or installed Android build) can use to
//    redirect at a local cloudemu-server, not just a bun script. A
//    deliberate, disclosed tradeoff, not an oversight: unlike (1), there
//    is no structural guarantee this can't be left set in a real
//    deployment - matching this app's own already-established posture
//    of storing real pasted AWS credentials in localStorage with no
//    additional gating (see cloud_credentials.ts) rather than a new,
//    harder-to-get-right bundler-specific strip mechanism.
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
