import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, CloudDeployFile, CloudDeployResult, BearerTokenConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { DefaultCloudConnectProvider } from "./default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "./default_cloud_connect_provider.js";

const LIST_SITES_DESCRIPTOR: BearerProviderDescriptor = {
  strategy: "netlify",
  name: "Netlify",
  url: "https://api.netlify.com/api/v1/sites",
  parse: (data) =>
    (data as Array<{ id: string; name: string; state: string }>).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.state,
    })),
};

interface NetlifySite {
  readonly id: string;
  readonly url: string;
  readonly ssl_url?: string;
}

interface NetlifyDeployCreateResponse {
  readonly id: string;
  readonly required?: readonly string[];
}

interface NetlifyDeployStatusResponse {
  readonly id: string;
  readonly state: string;
  readonly url?: string;
  readonly ssl_url?: string;
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha1Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Netlify - real distinct deploy logic: its real digest-based deploy
// flow (confirmed live), create-or-reuse a site, hash each file with
// real Web Crypto SHA-1, tell Netlify the manifest, upload only the
// files it reports back as `required`, then poll until the deploy's
// real `state` reaches "ready". connect() keeps delegating to the same
// generic engine every bearer-token provider uses (LIST_SITES_DESCRIPTOR
// mirrors the prior spi-level NETLIFY_PROVIDER descriptor exactly) - the
// existing "list sites" behavior is unchanged, deploy() is a real,
// additive capability.
export class NetlifyCloudConnectProvider implements CloudConnectProvider {
  readonly concern = "cloudConnect" as const;
  readonly strategy = "netlify";
  private readonly listEngine: DefaultCloudConnectProvider;

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.listEngine = new DefaultCloudConnectProvider(LIST_SITES_DESCRIPTOR, config, this.apiAdapter);
  }

  connect(): Promise<CloudResource[]> {
    return this.listEngine.connect();
  }

  async deploy(files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
    const headers = { Authorization: `Bearer ${this.config.token}` };
    const site = existingTargetId ? { id: existingTargetId } : await this.createSite(headers);

    const hashes = await Promise.all(files.map(async (file) => ({ file, hash: await sha1Hex(file.content) })));
    const manifest = Object.fromEntries(hashes.map(({ file, hash }) => [file.path.replace(/^\/?/, "/"), hash]));

    let createResponse;
    try {
      createResponse = await this.apiAdapter.post<NetlifyDeployCreateResponse>(
        `https://api.netlify.com/api/v1/sites/${site.id}/deploys`,
        { files: manifest },
        { headers }
      );
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Netlify: network request failed while creating the deploy.");
    }
    if (createResponse.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Netlify: creating the deploy failed (${createResponse.status} ${createResponse.error}).`);
    }
    const deployId = createResponse.data.id;
    const requiredHashes = new Set(createResponse.data.required ?? []);

    for (const { file, hash } of hashes) {
      if (!requiredHashes.has(hash)) {
        continue;
      }
      const encodedPath = file.path
        .replace(/^\/?/, "")
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      let uploadResponse;
      try {
        uploadResponse = await this.apiAdapter.put(`https://api.netlify.com/api/v1/deploys/${deployId}/files/${encodedPath}`, file.content, {
          headers: { ...headers, "content-type": "application/octet-stream" },
        });
      } catch {
        throw new CloudConnectProviderError("NETWORK_ERROR", `Netlify: network request failed while uploading "${file.path}".`);
      }
      if (uploadResponse.error !== undefined) {
        throw new CloudConnectProviderError("REQUEST_FAILED", `Netlify: uploading "${file.path}" failed (${uploadResponse.status} ${uploadResponse.error}).`);
      }
    }

    const status = await this.pollUntilReady(deployId, headers);
    return { url: status.ssl_url ?? status.url ?? "", targetId: site.id };
  }

  private async createSite(headers: Record<string, string>): Promise<NetlifySite> {
    let response;
    try {
      response = await this.apiAdapter.post<NetlifySite>("https://api.netlify.com/api/v1/sites", {}, { headers });
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Netlify: network request failed while creating a site.");
    }
    if (response.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Netlify: creating a site failed (${response.status} ${response.error}).`);
    }
    return response.data;
  }

  private async pollUntilReady(deployId: string, headers: Record<string, string>): Promise<NetlifyDeployStatusResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      let response;
      try {
        response = await this.apiAdapter.get<NetlifyDeployStatusResponse>(`https://api.netlify.com/api/v1/deploys/${deployId}`, { headers });
      } catch {
        throw new CloudConnectProviderError("NETWORK_ERROR", "Netlify: network request failed while polling the deploy status.");
      }
      if (response.error !== undefined) {
        throw new CloudConnectProviderError("REQUEST_FAILED", `Netlify: polling the deploy failed (${response.status} ${response.error}).`);
      }
      if (response.data.state === "ready") {
        return response.data;
      }
      if (response.data.state === "error") {
        throw new CloudConnectProviderError("DEPLOY_FAILED", "Netlify: the deploy reported a real build error.");
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new CloudConnectProviderError("DEPLOY_TIMEOUT", `Netlify: the deploy did not reach "ready" within ${MAX_POLL_ATTEMPTS} seconds.`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CloudConnectProvider.weave() comment.
  }
}
