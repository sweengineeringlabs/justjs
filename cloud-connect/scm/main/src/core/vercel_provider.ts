import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, CloudDeployFile, CloudDeployResult, BearerTokenConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { DefaultCloudConnectProvider } from "./default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "./default_cloud_connect_provider.js";

const LIST_PROJECTS_DESCRIPTOR: BearerProviderDescriptor = {
  strategy: "vercel",
  name: "Vercel",
  url: "https://api.vercel.com/v9/projects",
  parse: (data) =>
    (data as { projects: Array<{ id: string; name: string; targets?: Record<string, unknown> }> }).projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.targets?.production ? "deployed" : "no production deployment",
    })),
};

interface VercelDeployCreateResponse {
  readonly id: string;
  readonly url: string;
  readonly readyState: string;
}

interface VercelDeployStatusResponse {
  readonly id: string;
  readonly url: string;
  readonly readyState: string;
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;
const DEFAULT_PROJECT_NAME = "ai-code-editor-project";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A raw string may contain non-Latin1 characters (e.g. an emoji in a
// README) that a bare `btoa()` throws on - this is the standard,
// documented JS idiom for a UTF-8-safe base64 encode, no library.
function base64EncodeUtf8(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

// Vercel - real distinct deploy logic: files are inlined directly in
// one POST body (confirmed live/via docs - no separate upload step,
// unlike Netlify), and a project auto-upserts by `name` - redeploying
// with the same name updates the same real project rather than
// creating a new one, so `existingTargetId` here is just the project
// name to reuse (falls back to a fixed default on the very first
// deploy). connect() keeps delegating to the same generic engine every
// bearer-token provider uses for the existing "list projects" behavior
// - deploy() is a real, additive capability.
export class VercelCloudConnectProvider implements CloudConnectProvider {
  readonly concern = "cloudConnect" as const;
  readonly strategy = "vercel";
  private readonly listEngine: DefaultCloudConnectProvider;

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.listEngine = new DefaultCloudConnectProvider(LIST_PROJECTS_DESCRIPTOR, config, this.apiAdapter);
  }

  connect(): Promise<CloudResource[]> {
    return this.listEngine.connect();
  }

  async deploy(files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
    const projectName = existingTargetId ?? DEFAULT_PROJECT_NAME;
    const headers = { Authorization: `Bearer ${this.config.token}` };
    const body = {
      name: projectName,
      target: "production",
      projectSettings: { framework: null },
      files: files.map((file) => ({
        file: file.path.replace(/^\/+/, ""),
        data: base64EncodeUtf8(file.content),
        encoding: "base64",
      })),
    };

    let createResponse;
    try {
      createResponse = await this.apiAdapter.post<VercelDeployCreateResponse>(
        "https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1",
        body,
        { headers }
      );
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Vercel: network request failed while creating the deployment.");
    }
    if (createResponse.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Vercel: creating the deployment failed (${createResponse.status} ${createResponse.error}).`);
    }

    const status = await this.pollUntilReady(createResponse.data.id, headers);
    return { url: `https://${status.url}`, targetId: projectName };
  }

  private async pollUntilReady(deploymentId: string, headers: Record<string, string>): Promise<VercelDeployStatusResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      let response;
      try {
        response = await this.apiAdapter.get<VercelDeployStatusResponse>(`https://api.vercel.com/v13/deployments/${deploymentId}`, { headers });
      } catch {
        throw new CloudConnectProviderError("NETWORK_ERROR", "Vercel: network request failed while polling the deployment status.");
      }
      if (response.error !== undefined) {
        throw new CloudConnectProviderError("REQUEST_FAILED", `Vercel: polling the deployment failed (${response.status} ${response.error}).`);
      }
      if (response.data.readyState === "READY") {
        return response.data;
      }
      if (response.data.readyState === "ERROR" || response.data.readyState === "CANCELED") {
        throw new CloudConnectProviderError("DEPLOY_FAILED", `Vercel: the deployment reported a real ${response.data.readyState.toLowerCase()} state.`);
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new CloudConnectProviderError("DEPLOY_TIMEOUT", `Vercel: the deployment did not reach "READY" within ${MAX_POLL_ATTEMPTS} seconds.`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CloudConnectProvider.weave() comment.
  }
}
