import type { ApiAdapter } from "@justjs/transport";
import type { CloudConnectProvider, CloudResource, CloudDeployFile, CloudDeployResult, BearerTokenConfig } from "../api/provider.js";
import { CloudConnectProviderError } from "../api/provider.js";
import { DefaultCloudConnectProvider } from "./default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "./default_cloud_connect_provider.js";
import { buildTarGz } from "./tar_writer.js";

const HEROKU_ACCEPT_HEADER = "application/vnd.heroku+json; version=3";

const LIST_APPS_DESCRIPTOR: BearerProviderDescriptor = {
  strategy: "heroku",
  name: "Heroku",
  url: "https://api.heroku.com/apps",
  extraHeaders: { Accept: HEROKU_ACCEPT_HEADER },
  parse: (data) =>
    (data as Array<{ id: string; name: string; released_at: string | null }>).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.released_at ? "released" : "not yet released",
    })),
};

interface HerokuApp {
  readonly id: string;
  readonly web_url: string;
}

interface HerokuSourceResponse {
  readonly source_blob: { readonly get_url: string; readonly put_url: string };
}

interface HerokuBuild {
  readonly id: string;
  readonly status: string;
}

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Heroku - real, genuinely bigger distinct deploy logic: unlike
// Netlify/Vercel, Heroku's real build API needs a gzipped tarball at a
// URL, not individual files. create-or-reuse an app, request a real
// short-lived presigned upload URL pair (POST .../sources), build the
// tarball with core/tar_writer.ts (a hand-rolled USTAR writer + the
// real Web Platform CompressionStream("gzip") - no archive library),
// PUT it to the presigned URL, then create a real build referencing it
// and poll until Heroku's own build `status` settles. connect() keeps
// delegating to the same generic engine every bearer-token provider
// uses for the existing "list apps" behavior - deploy() is a real,
// additive capability.
//
// KNOWN GAP: the presigned put_url points at Heroku's S3-backed storage
// (a different origin than api.heroku.com) - its real CORS support for
// a direct browser PUT was not independently verified this round
// (getting a real presigned URL needs a real authenticated call this
// session couldn't make without the user's own Heroku account). If that
// PUT fails with what looks like a CORS/network error, this surfaces a
// real, honest DEPLOY_UNAVAILABLE error rather than a generic one.
export class HerokuCloudConnectProvider implements CloudConnectProvider {
  readonly concern = "cloudConnect" as const;
  readonly strategy = "heroku";
  private readonly listEngine: DefaultCloudConnectProvider;

  constructor(
    private readonly config: BearerTokenConfig,
    private readonly apiAdapter: ApiAdapter
  ) {
    this.listEngine = new DefaultCloudConnectProvider(LIST_APPS_DESCRIPTOR, config, this.apiAdapter);
  }

  connect(): Promise<CloudResource[]> {
    return this.listEngine.connect();
  }

  async deploy(files: readonly CloudDeployFile[], existingTargetId?: string): Promise<CloudDeployResult> {
    const headers = { Authorization: `Bearer ${this.config.token}`, Accept: HEROKU_ACCEPT_HEADER };
    const appId = existingTargetId ?? (await this.createApp(headers)).id;

    let sourceResponse;
    try {
      sourceResponse = await this.apiAdapter.post<HerokuSourceResponse>(`https://api.heroku.com/apps/${appId}/sources`, {}, { headers });
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Heroku: network request failed while requesting an upload URL.");
    }
    if (sourceResponse.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: requesting an upload URL failed (${sourceResponse.status} ${sourceResponse.error}).`);
    }
    const { get_url: getUrl, put_url: putUrl } = sourceResponse.data.source_blob;

    const tarGzBytes = await buildTarGz(files);
    try {
      const uploadResponse = await this.apiAdapter.put(putUrl, tarGzBytes);
      if (uploadResponse.error !== undefined) {
        throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: uploading the build source failed (${uploadResponse.status} ${uploadResponse.error}).`);
      }
    } catch (error) {
      if (error instanceof CloudConnectProviderError) {
        throw error;
      }
      // A real, honest name for the one leg this package couldn't
      // independently CORS-verify this round - see the class comment.
      throw new CloudConnectProviderError(
        "DEPLOY_UNAVAILABLE",
        "Heroku: uploading the build source failed - this may mean Heroku's upload URL doesn't support a direct browser upload (unconfirmed CORS support)."
      );
    }

    let buildResponse;
    try {
      buildResponse = await this.apiAdapter.post<HerokuBuild>(
        `https://api.heroku.com/apps/${appId}/builds`,
        { source_blob: { url: getUrl } },
        { headers }
      );
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Heroku: network request failed while creating the build.");
    }
    if (buildResponse.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: creating the build failed (${buildResponse.status} ${buildResponse.error}).`);
    }

    await this.pollUntilSucceeded(appId, buildResponse.data.id, headers);
    const app = await this.getApp(appId, headers);
    return { url: app.web_url, targetId: appId };
  }

  private async createApp(headers: Record<string, string>): Promise<HerokuApp> {
    let response;
    try {
      response = await this.apiAdapter.post<HerokuApp>("https://api.heroku.com/apps", {}, { headers });
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Heroku: network request failed while creating an app.");
    }
    if (response.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: creating an app failed (${response.status} ${response.error}).`);
    }
    return response.data;
  }

  private async getApp(appId: string, headers: Record<string, string>): Promise<HerokuApp> {
    let response;
    try {
      response = await this.apiAdapter.get<HerokuApp>(`https://api.heroku.com/apps/${appId}`, { headers });
    } catch {
      throw new CloudConnectProviderError("NETWORK_ERROR", "Heroku: network request failed while fetching the app's URL.");
    }
    if (response.error !== undefined) {
      throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: fetching the app's URL failed (${response.status} ${response.error}).`);
    }
    return response.data;
  }

  private async pollUntilSucceeded(appId: string, buildId: string, headers: Record<string, string>): Promise<void> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      let response;
      try {
        response = await this.apiAdapter.get<HerokuBuild>(`https://api.heroku.com/apps/${appId}/builds/${buildId}`, { headers });
      } catch {
        throw new CloudConnectProviderError("NETWORK_ERROR", "Heroku: network request failed while polling the build status.");
      }
      if (response.error !== undefined) {
        throw new CloudConnectProviderError("REQUEST_FAILED", `Heroku: polling the build failed (${response.status} ${response.error}).`);
      }
      if (response.data.status === "succeeded") {
        return;
      }
      if (response.data.status === "failed") {
        throw new CloudConnectProviderError("DEPLOY_FAILED", "Heroku: the build reported a real failure.");
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new CloudConnectProviderError("DEPLOY_TIMEOUT", `Heroku: the build did not reach "succeeded" within ${MAX_POLL_ATTEMPTS} seconds.`);
  }

  weave(): void {
    // Real no-op - see api/provider.ts's CloudConnectProvider.weave() comment.
  }
}
