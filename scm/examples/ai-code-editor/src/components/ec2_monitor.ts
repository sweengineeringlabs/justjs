import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import {
  listAwsEc2Instances,
  startAwsEc2Instance,
  stopAwsEc2Instance,
  terminateAwsEc2Instance,
  runCommandOnAwsEc2Instance,
  getAwsEc2CommandStatus,
  getAwsEc2CpuUtilization,
} from "../core/ec2_provisioning.js";
import type { CloudWatchMetricDatapoint, Ec2CommandStatus, Ec2InstanceState } from "../core/ec2_provisioning.js";
import { getEc2Ledger, removeEc2LedgerEntry, reconcileEc2Ledger } from "../core/ec2_ledger.js";
import { generateGitRepoRedeployCommands, generateContainerImageRedeployCommands } from "../core/ec2_deploy_templates.js";

type DeployMode = "raw" | "git" | "container";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const RUNNING_STATES = new Set(["pending", "running", "stopping", "stopped"]);

// Real Monitor half of what used to be Ec2ProvisioningControl's one
// combined Configure+Monitor screen (justjs#151's Deployment/Operations
// split) - list/start/stop/terminate real EC2 instances, redeploy via
// SSM, view per-instance CloudWatch metrics. Lives under Operations ->
// Monitoring now, not Deployment -> Cloud - managing what's already
// running (and possibly still billing) is an operational concern, not
// a deploy one. Launching happens in Ec2ProvisioningControl
// (Deployment -> Cloud -> Instances); this control never creates a new
// instance, only acts on ones that already exist.
export class Ec2MonitorControl extends HTMLElement {
  #instances: readonly Ec2InstanceState[] | null = null;
  #loadingInstances = false;
  #loadError: string | null = null;
  #pendingActionInstanceId: string | null = null;
  // ADR-0020/justjs#149 - guided deploy-input modes for the Redeploy
  // panel's SSM commands, same generators Ec2ProvisioningControl's
  // Configure form uses for UserData at launch.
  #redeployMode: DeployMode = "raw";
  // Only one instance's panel is open at a time (same single-panel
  // pattern the Metrics panel below uses).
  #redeployInstanceId: string | null = null;
  #redeploySending = false;
  #redeployError: string | null = null;
  #redeployCommandId: string | null = null;
  #redeployStatus: Ec2CommandStatus | null = null;
  #redeployCheckingStatus = false;
  #metricsInstanceId: string | null = null;
  #metricsLoading = false;
  #metricsError: string | null = null;
  #metricsDatapoints: readonly CloudWatchMetricDatapoint[] | null = null;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.render();
  }

  resetView(): void {
    this.#instances = null;
    this.#loadingInstances = false;
    this.#loadError = null;
    this.#pendingActionInstanceId = null;
    this.#resetRedeployPanel();
    this.#resetMetricsPanel();
    this.render();
  }

  #resetRedeployPanel(): void {
    this.#redeployInstanceId = null;
    this.#redeployMode = "raw";
    this.#redeploySending = false;
    this.#redeployError = null;
    this.#redeployCommandId = null;
    this.#redeployStatus = null;
    this.#redeployCheckingStatus = false;
  }

  #resetMetricsPanel(): void {
    this.#metricsInstanceId = null;
    this.#metricsLoading = false;
    this.#metricsError = null;
    this.#metricsDatapoints = null;
  }

  async #loadInstances(): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#loadingInstances = true;
    this.#loadError = null;
    this.render();
    try {
      this.#instances = await listAwsEc2Instances(creds.accessKeyId, creds.secretAccessKey);
      reconcileEc2Ledger(new Set(this.#instances.map((i) => i.instanceId)));
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
      this.#instances = null;
    } finally {
      this.#loadingInstances = false;
      this.render();
    }
  }

  async #handleAction(action: "start" | "stop" | "terminate", instanceId: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#pendingActionInstanceId = instanceId;
    this.render();
    try {
      if (action === "start") {
        await startAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, instanceId);
      } else if (action === "stop") {
        await stopAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, instanceId);
      } else {
        await terminateAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, instanceId);
        removeEc2LedgerEntry(instanceId);
      }
      await this.#loadInstances();
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#pendingActionInstanceId = null;
      this.render();
    }
  }

  // ADR-0019 Option B - real only for instances the user opted into via
  // an iamInstanceProfileName at launch; this control never predicts
  // that client-side, AWS's own real error (e.g. "TargetNotConnected")
  // surfaces in #redeployError otherwise, same as every other real
  // error path in this control.
  async #handleSendCommand(instanceId: string, commands: readonly string[]): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds || commands.length === 0) {
      return;
    }
    this.#redeploySending = true;
    this.#redeployError = null;
    this.#redeployCommandId = null;
    this.#redeployStatus = null;
    this.render();
    try {
      const result = await runCommandOnAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, instanceId, commands);
      this.#redeployCommandId = result.commandId;
    } catch (e) {
      this.#redeployError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#redeploySending = false;
      this.render();
    }
  }

  async #handleCheckCommandStatus(instanceId: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds || !this.#redeployCommandId) {
      return;
    }
    this.#redeployCheckingStatus = true;
    this.render();
    try {
      this.#redeployStatus = await getAwsEc2CommandStatus(creds.accessKeyId, creds.secretAccessKey, this.#redeployCommandId, instanceId);
    } catch (e) {
      this.#redeployError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#redeployCheckingStatus = false;
      this.render();
    }
  }

  // Real per-instance CloudWatch CPUUtilization, last hour - reuses the
  // same getCloudWatchMetricStatistics() the Alarms tile already calls,
  // scoped to this one instance via the AWS/EC2 InstanceId dimension.
  async #loadMetrics(instanceId: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#metricsLoading = true;
    this.#metricsError = null;
    this.render();
    try {
      this.#metricsDatapoints = await getAwsEc2CpuUtilization(creds.accessKeyId, creds.secretAccessKey, instanceId);
    } catch (e) {
      this.#metricsError = e instanceof Error ? e.message : String(e);
      this.#metricsDatapoints = null;
    } finally {
      this.#metricsLoading = false;
      this.render();
    }
  }

  private render(): void {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      this.#root.innerHTML = `
        <style>:host { display: block; } .connect-hint { margin: 0; font-size: 12px; line-height: 1.4; color: var(--text-muted); }</style>
        <p class="connect-hint">Connect a real AWS account first - see Deployment → Cloud.</p>
      `;
      return;
    }
    if (this.#instances === null && !this.#loadingInstances && !this.#loadError) {
      void this.#loadInstances();
    }

    const ledger = getEc2Ledger();

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
        .field label { font-size: 12px; color: var(--text-muted); }
        .field input, .field select, .field textarea {
          font: inherit; font-size: 14px; padding: 8px 10px; border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border); background: var(--surface); color: var(--text);
        }
        .field-hint { margin: 4px 0 0; font-size: 11px; line-height: 1.4; color: var(--text-muted); }
        .field-row { display: flex; gap: 10px; }
        .field-row .field { flex: 1; }
        .redeploy-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .redeploy-panel textarea { width: 100%; box-sizing: border-box; margin: 0 0 8px; }
        .command-result { margin: 8px 0 0; font-size: 12px; }
        .command-result pre { white-space: pre-wrap; word-break: break-word; background: var(--surface); padding: 8px; border-radius: var(--radius-md, 8px); margin: 6px 0 0; }
        .metrics-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .metrics-panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .metrics-panel th, .metrics-panel td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); }
        .userdata-preview { white-space: pre-wrap; word-break: break-word; background: var(--surface); padding: 8px; border-radius: var(--radius-md, 8px); margin: 8px 0 0; font-family: ui-monospace, monospace; font-size: 11px; }
        button.btn-primary, button.btn-secondary, button.btn-danger {
          border: none; padding: 10px 18px; font-size: 14px; font-family: inherit; font-weight: 600;
          border-radius: var(--radius-pill); cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.btn-primary { background: var(--accent-strong, var(--accent)); color: white; }
        button.btn-secondary { background: var(--surface-alt); color: var(--text); }
        button.btn-danger { background: var(--surface-alt); color: #c0392b; }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        .error-text { color: #c0392b; font-size: 12px; margin: 8px 0 0; }
        .ledger-hint { margin: 0 0 10px; padding: 8px 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); font-size: 12px; color: var(--text-muted); }
        .instance-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .instance-row:last-child { border-bottom: none; }
        .instance-id { font-weight: 600; font-size: 14px; }
        .instance-meta { font-size: 12px; color: var(--text-muted); }
        .instance-state { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-pill); white-space: nowrap; }
        .instance-state-running { background: #d4edda; color: #1e7e34; }
        .instance-state-stopped { background: var(--surface-alt); color: var(--text-muted); }
        .instance-state-terminated { background: #f8d7da; color: #c0392b; }
        .instance-state-pending, .instance-state-stopping, .instance-state-shutting-down { background: #fff3cd; color: #856404; }
        .instance-actions { display: flex; gap: 6px; }
      </style>
      ${
        ledger.length > 0
          ? `<p class="ledger-hint">📋 This app has launched ${ledger.length} instance${ledger.length === 1 ? "" : "s"} you may still be responsible for: ${ledger.map((e) => escapeHtml(e.instanceId)).join(", ")}.</p>`
          : ""
      }
      <div id="instances-list"></div>
    `;

    const listEl = this.#root.querySelector<HTMLElement>("#instances-list")!;
    if (this.#loadingInstances) {
      listEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    } else if (this.#loadError) {
      listEl.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(this.#loadError)}</p>`;
    } else if (!this.#instances || this.#instances.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No instances yet - launch one in Deployment → Cloud.</p>`;
    } else {
      listEl.innerHTML = this.#instances
        .map((i) => {
          const isPending = this.#pendingActionInstanceId === i.instanceId;
          const canStart = i.state === "stopped";
          const canStop = i.state === "running";
          const canTerminate = RUNNING_STATES.has(i.state);
          const redeployOpen = this.#redeployInstanceId === i.instanceId;
          const metricsOpen = this.#metricsInstanceId === i.instanceId;
          return `
            <div class="instance-row">
              <div>
                <div class="instance-id">${escapeHtml(i.instanceId)}</div>
                <div class="instance-meta">${escapeHtml(i.instanceType)} · ${escapeHtml(i.imageId)}${i.privateIpAddress ? ` · ${escapeHtml(i.privateIpAddress)}` : ""}</div>
              </div>
              <span class="instance-state instance-state-${i.state}">${escapeHtml(i.state)}</span>
              <div class="instance-actions">
                <button type="button" class="btn-secondary" data-metrics-toggle="${escapeHtml(i.instanceId)}">${metricsOpen ? "Hide Metrics" : "Metrics"}</button>
                ${canStart ? `<button type="button" class="btn-secondary" data-start="${escapeHtml(i.instanceId)}" ${isPending ? "disabled" : ""}>${isPending ? "…" : "Start"}</button>` : ""}
                ${canStop ? `<button type="button" class="btn-secondary" data-redeploy-toggle="${escapeHtml(i.instanceId)}">${redeployOpen ? "Cancel Redeploy" : "Redeploy"}</button>` : ""}
                ${canStop ? `<button type="button" class="btn-secondary" data-stop="${escapeHtml(i.instanceId)}" ${isPending ? "disabled" : ""}>${isPending ? "…" : "Stop"}</button>` : ""}
                ${canTerminate ? `<button type="button" class="btn-danger" data-terminate="${escapeHtml(i.instanceId)}" ${isPending ? "disabled" : ""}>${isPending ? "…" : "Terminate"}</button>` : ""}
              </div>
            </div>
            ${
              metricsOpen
                ? `<div class="metrics-panel">
                    <p class="field-hint">Real CloudWatch CPUUtilization for this instance, last hour, 5-minute average - AWS/EC2 metrics can take a few minutes to appear after launch, so an empty result right after launching isn't an error.</p>
                    ${this.#metricsLoading ? `<p class="connect-hint">Loading…</p>` : ""}
                    ${this.#metricsError ? `<p class="error-text">⚠️ ${escapeHtml(this.#metricsError)}</p>` : ""}
                    ${
                      !this.#metricsLoading && !this.#metricsError && this.#metricsDatapoints
                        ? this.#metricsDatapoints.length === 0
                          ? `<p class="connect-hint">No datapoints yet for this instance.</p>`
                          : `<table>
                              <thead><tr><th>Time</th><th>CPU</th></tr></thead>
                              <tbody>
                                ${[...this.#metricsDatapoints]
                                  .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                                  .map((d) => `<tr><td>${escapeHtml(d.timestamp)}</td><td>${d.value.toFixed(2)}${escapeHtml(d.unit === "Percent" ? "%" : ` ${d.unit}`)}</td></tr>`)
                                  .join("")}
                              </tbody>
                            </table>`
                        : ""
                    }
                  </div>`
                : ""
            }
            ${
              redeployOpen
                ? `<div class="redeploy-panel">
                    <p class="field-hint">Runs against this instance right now via SSM - only works if it has a real IAM instance profile with SSM permissions attached (this app never creates or checks that for you; AWS's own error surfaces below if it isn't set up).</p>
                    <div class="field">
                      <label>Deploy mode</label>
                      <select id="redeployMode">
                        <option value="raw" ${this.#redeployMode === "raw" ? "selected" : ""}>Raw script</option>
                        <option value="git" ${this.#redeployMode === "git" ? "selected" : ""}>Git repo</option>
                        <option value="container" ${this.#redeployMode === "container" ? "selected" : ""}>Container image</option>
                      </select>
                    </div>
                    ${
                      this.#redeployMode === "raw"
                        ? `<textarea id="redeploy-script" rows="4" placeholder="systemctl restart myapp"></textarea>`
                        : this.#redeployMode === "git"
                          ? `<div class="field-row">
                              <div class="field">
                                <label>Git repo URL</label>
                                <input id="redeployGitRepoUrl" type="text" placeholder="https://github.com/example/app.git" />
                              </div>
                              <div class="field">
                                <label>Branch</label>
                                <input id="redeployGitBranch" type="text" placeholder="main" value="main" />
                              </div>
                            </div>
                            <div class="field">
                              <label>Start command</label>
                              <input id="redeployGitStartCommand" type="text" placeholder="npm start" />
                            </div>
                            <pre id="redeploy-commands-preview" class="userdata-preview"></pre>`
                          : `<div class="field-row">
                              <div class="field">
                                <label>Container image</label>
                                <input id="redeployContainerImage" type="text" placeholder="nginx:latest" />
                              </div>
                              <div class="field">
                                <label>Port</label>
                                <input id="redeployContainerPort" type="number" placeholder="8080" value="8080" />
                              </div>
                            </div>
                            <pre id="redeploy-commands-preview" class="userdata-preview"></pre>`
                    }
                    <button type="button" class="btn-primary" data-send-command="${escapeHtml(i.instanceId)}" ${this.#redeploySending ? "disabled" : ""}>${this.#redeploySending ? "Sending…" : "Send Command"}</button>
                    ${this.#redeployError ? `<p class="error-text">⚠️ ${escapeHtml(this.#redeployError)}</p>` : ""}
                    ${
                      this.#redeployCommandId
                        ? `<div class="command-result">
                            Command ID: <code>${escapeHtml(this.#redeployCommandId)}</code>
                            <button type="button" class="btn-secondary" data-check-status="${escapeHtml(i.instanceId)}" ${this.#redeployCheckingStatus ? "disabled" : ""}>${this.#redeployCheckingStatus ? "Checking…" : "Check Status"}</button>
                            ${
                              this.#redeployStatus
                                ? `<p>Status: <strong>${escapeHtml(this.#redeployStatus.status)}</strong></p>
                                   ${this.#redeployStatus.output ? `<pre>${escapeHtml(this.#redeployStatus.output)}</pre>` : ""}
                                   ${this.#redeployStatus.errorOutput ? `<pre>${escapeHtml(this.#redeployStatus.errorOutput)}</pre>` : ""}`
                                : ""
                            }
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
          `;
        })
        .join("");
      listEl.querySelectorAll<HTMLButtonElement>("button[data-start]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleAction("start", btn.dataset["start"]!));
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-stop]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleAction("stop", btn.dataset["stop"]!));
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-terminate]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleAction("terminate", btn.dataset["terminate"]!));
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-redeploy-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const instanceId = btn.dataset["redeployToggle"]!;
          if (this.#redeployInstanceId === instanceId) {
            this.#resetRedeployPanel();
          } else {
            this.#resetRedeployPanel();
            this.#redeployInstanceId = instanceId;
          }
          this.render();
        });
      });
      const redeployModeSelect = this.#root.querySelector<HTMLSelectElement>("#redeployMode");
      if (redeployModeSelect) {
        redeployModeSelect.addEventListener("change", () => {
          this.#redeployMode = redeployModeSelect.value as DeployMode;
          this.render();
        });
      }
      // Update the <pre> directly on input, no full re-render mid-
      // keystroke (same reasoning Ec2ProvisioningControl's own Configure
      // preview uses).
      const updateRedeployCommandsPreview = (): void => {
        const preview = this.#root.querySelector<HTMLElement>("#redeploy-commands-preview");
        if (!preview) {
          return;
        }
        const val = (id: string) => this.#root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
        if (this.#redeployMode === "git") {
          preview.textContent = generateGitRepoRedeployCommands({
            repoUrl: val("redeployGitRepoUrl"),
            branch: val("redeployGitBranch").trim() || "main",
            startCommand: val("redeployGitStartCommand"),
          }).join("\n");
        } else if (this.#redeployMode === "container") {
          preview.textContent = generateContainerImageRedeployCommands({
            image: val("redeployContainerImage"),
            port: Number(val("redeployContainerPort")) || 0,
          }).join("\n");
        }
      };
      updateRedeployCommandsPreview();
      ["#redeployGitRepoUrl", "#redeployGitBranch", "#redeployGitStartCommand", "#redeployContainerImage", "#redeployContainerPort"].forEach(
        (sel) => {
          this.#root.querySelector<HTMLInputElement>(sel)?.addEventListener("input", updateRedeployCommandsPreview);
        }
      );

      listEl.querySelectorAll<HTMLButtonElement>("button[data-send-command]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const instanceId = btn.dataset["sendCommand"]!;
          const val = (id: string) => this.#root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
          const commands =
            this.#redeployMode === "git"
              ? generateGitRepoRedeployCommands({
                  repoUrl: val("redeployGitRepoUrl"),
                  branch: val("redeployGitBranch").trim() || "main",
                  startCommand: val("redeployGitStartCommand"),
                })
              : this.#redeployMode === "container"
                ? generateContainerImageRedeployCommands({ image: val("redeployContainerImage"), port: Number(val("redeployContainerPort")) || 0 })
                : (this.#root.querySelector<HTMLTextAreaElement>("#redeploy-script")?.value ?? "")
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
          void this.#handleSendCommand(instanceId, commands);
        });
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-check-status]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleCheckCommandStatus(btn.dataset["checkStatus"]!));
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-metrics-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const instanceId = btn.dataset["metricsToggle"]!;
          if (this.#metricsInstanceId === instanceId) {
            this.#resetMetricsPanel();
            this.render();
          } else {
            this.#resetMetricsPanel();
            this.#metricsInstanceId = instanceId;
            void this.#loadMetrics(instanceId);
          }
        });
      });
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-ec2-monitor")) {
  customElements.define("control-ec2-monitor", Ec2MonitorControl);
}
