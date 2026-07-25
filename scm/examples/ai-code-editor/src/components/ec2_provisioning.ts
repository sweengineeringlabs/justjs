import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import {
  runAwsEc2Instance,
  listAwsEc2Instances,
  startAwsEc2Instance,
  stopAwsEc2Instance,
  terminateAwsEc2Instance,
  runCommandOnAwsEc2Instance,
  getAwsEc2CommandStatus,
  getAwsEc2CpuUtilization,
} from "../core/ec2_provisioning.js";
import type { CloudWatchMetricDatapoint, Ec2CommandStatus, Ec2InstanceConfig, Ec2InstanceState } from "../core/ec2_provisioning.js";
import { EC2_INSTANCE_TYPE_OPTIONS, formatEc2HourlyEstimate } from "../core/ec2_cost_estimates.js";
import { getEc2Ledger, addEc2LedgerEntry, removeEc2LedgerEntry, reconcileEc2Ledger } from "../core/ec2_ledger.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const RUNNING_STATES = new Set(["pending", "running", "stopping", "stopped"]);

// Real guided workflow (connect -> configure -> deploy -> monitor) for
// AWS EC2 instances (justjs#144/ADR-0017) - the second provisioning
// phase after CloudWatch's alarm pilot. Unlike an alarm, RunInstances is
// real, billable, hard-to-undo AWS spend, so this control adds two
// things CloudWatch's own didn't need: a real cost estimate in Configure
// (core/ec2_cost_estimates.ts) and a second, distinct confirmation gate
// beyond a single click - an explicit "I understand" checkbox that must
// be checked before Confirm Launch is even enabled, not just a second
// button press. runEc2Instance/terminateEc2Instance both ship in this
// same control (never one without the other - this app has no backend
// to mediate a stuck, still-billing instance).
export class Ec2ProvisioningControl extends HTMLElement {
  #instances: readonly Ec2InstanceState[] | null = null;
  #loadingInstances = false;
  #loadError: string | null = null;
  #launching = false;
  #launchError: string | null = null;
  #confirmingLaunch = false;
  #confirmChecked = false;
  // Real bug found via live UI verification against CloudEmu (not
  // caught by unit tests, which call #handleLaunch directly and never
  // exercise render()'s own re-render path): render() rebuilds the
  // entire Configure form's HTML from scratch whenever #confirmingLaunch
  // flips true, and none of the plain <input>/<textarea> elements carry
  // a `value` reflecting what the user typed - so clicking "Launch
  // Instance" silently wiped imageId/keyName/userData/
  // iamInstanceProfileName back to empty before Confirm Launch ever
  // read them. Fixed by reading the form once, in the "Launch Instance"
  // click handler itself (before the confirm-box re-render happens),
  // and using this stored config rather than re-querying the DOM later.
  #pendingLaunchConfig: Ec2InstanceConfig | null = null;
  #pendingActionInstanceId: string | null = null;
  // ADR-0019 Option B redeploy panel - only one instance's panel is
  // open at a time (same single-panel pattern the confirm-launch box
  // above already uses), so these track that one instance rather than
  // a map keyed by every instance.
  #redeployInstanceId: string | null = null;
  #redeploySending = false;
  #redeployError: string | null = null;
  #redeployCommandId: string | null = null;
  #redeployStatus: Ec2CommandStatus | null = null;
  #redeployCheckingStatus = false;
  // Real per-instance CloudWatch metrics panel - same single-panel-at-
  // a-time pattern as the Redeploy panel above.
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

  // Same reset-on-navigate-away need every other cached control in this
  // app has (justjs#138/#139's own resetView() precedent).
  resetView(): void {
    this.#instances = null;
    this.#loadingInstances = false;
    this.#loadError = null;
    this.#launching = false;
    this.#launchError = null;
    this.#confirmingLaunch = false;
    this.#confirmChecked = false;
    this.#pendingLaunchConfig = null;
    this.#pendingActionInstanceId = null;
    this.#resetRedeployPanel();
    this.#resetMetricsPanel();
    this.render();
  }

  #resetRedeployPanel(): void {
    this.#redeployInstanceId = null;
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

  async #handleLaunch(config: Ec2InstanceConfig): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#launching = true;
    this.#launchError = null;
    this.#confirmingLaunch = false;
    this.#pendingLaunchConfig = null;
    this.render();
    try {
      const instance = await runAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, config);
      addEc2LedgerEntry({ instanceId: instance.instanceId, instanceType: instance.instanceType, launchedAt: instance.launchTime });
      await this.#loadInstances();
    } catch (e) {
      this.#launchError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#launching = false;
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
        <p class="connect-hint">Connect a real AWS account above first - EC2 instances need a working AWS connection.</p>
      `;
      return;
    }
    if (this.#instances === null && !this.#loadingInstances && !this.#loadError) {
      void this.#loadInstances();
    }

    const ledger = getEc2Ledger();
    const selectedType = this.#root.querySelector<HTMLSelectElement>("#instanceType")?.value ?? EC2_INSTANCE_TYPE_OPTIONS[0]!.instanceType;

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .section-title { margin: 18px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
        .field label { font-size: 12px; color: var(--text-muted); }
        .field input, .field select, .field textarea {
          font: inherit; font-size: 14px; padding: 8px 10px; border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border); background: var(--surface); color: var(--text);
        }
        .field textarea { resize: vertical; font-family: ui-monospace, monospace; font-size: 12px; }
        .field-hint { margin: 4px 0 0; font-size: 11px; line-height: 1.4; color: var(--text-muted); }
        .field-row { display: flex; gap: 10px; }
        .field-row .field { flex: 1; }
        .cost-hint { margin: -4px 0 10px; font-size: 12px; color: var(--text-muted); }
        .redeploy-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .redeploy-panel textarea { width: 100%; box-sizing: border-box; margin: 0 0 8px; }
        .command-result { margin: 8px 0 0; font-size: 12px; }
        .command-result pre { white-space: pre-wrap; word-break: break-word; background: var(--surface); padding: 8px; border-radius: var(--radius-md, 8px); margin: 6px 0 0; }
        .metrics-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .metrics-panel table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .metrics-panel th, .metrics-panel td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border); }
        button.btn-primary, button.btn-secondary, button.btn-danger {
          border: none; padding: 10px 18px; font-size: 14px; font-family: inherit; font-weight: 600;
          border-radius: var(--radius-pill); cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.btn-primary { background: var(--accent-strong, var(--accent)); color: white; }
        button.btn-secondary { background: var(--surface-alt); color: var(--text); }
        button.btn-danger { background: var(--surface-alt); color: #c0392b; }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        .confirm-box { margin: 10px 0 0; padding: 12px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .confirm-box p { margin: 0 0 10px; font-size: 13px; }
        .confirm-box .warn { font-weight: 600; color: #c0392b; }
        .confirm-check { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 12px; font-size: 13px; }
        .confirm-actions { display: flex; gap: 10px; }
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
      <p class="connect-hint warn-hint">⚠️ EC2 instances are real, billable AWS resources, unlike CloudWatch alarms - launching one costs real money until it's stopped or terminated.</p>
      ${
        ledger.length > 0
          ? `<p class="ledger-hint">📋 This app has launched ${ledger.length} instance${ledger.length === 1 ? "" : "s"} you may still be responsible for: ${ledger.map((e) => escapeHtml(e.instanceId)).join(", ")}. Check Monitor below.</p>`
          : ""
      }

      <p class="section-title">Configure</p>
      <div class="field-row">
        <div class="field">
          <label>Instance type</label>
          <select id="instanceType">${EC2_INSTANCE_TYPE_OPTIONS.map((o) => `<option value="${o.instanceType}" ${o.instanceType === selectedType ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>AMI ID</label>
          <input id="imageId" type="text" placeholder="ami-0abcdef1234567890" />
        </div>
      </div>
      <p class="cost-hint" id="cost-hint">${escapeHtml(formatEc2HourlyEstimate(selectedType))}</p>
      <div class="field">
        <label>Key pair name (optional)</label>
        <input id="keyName" type="text" placeholder="my-key-pair" />
      </div>
      <div class="field">
        <label>Startup script / userData (optional)</label>
        <textarea id="userData" rows="4" placeholder="#!/bin/sh&#10;echo hello"></textarea>
        <p class="field-hint">Runs once, at first boot only - redeploying a code change means launching a new instance with an updated script, not updating this one.</p>
      </div>
      <div class="field">
        <label>IAM instance profile name (optional)</label>
        <input id="iamInstanceProfileName" type="text" placeholder="my-ssm-profile" />
        <p class="field-hint">Must already exist in your AWS account (this app never creates one) - enables the Redeploy action below once the instance is running.</p>
      </div>
      <button id="launch-btn" type="button" class="btn-primary" ${this.#launching ? "disabled" : ""}>${this.#launching ? "Launching…" : "Launch Instance"}</button>
      ${
        this.#confirmingLaunch
          ? `<div class="confirm-box">
              <p class="warn">This will launch a real ${escapeHtml(selectedType)} instance on the connected AWS account, billed at ${escapeHtml(formatEc2HourlyEstimate(selectedType))} until stopped or terminated.</p>
              <label class="confirm-check">
                <input type="checkbox" id="confirm-check" ${this.#confirmChecked ? "checked" : ""} />
                <span>I understand this launches a real, billable instance and I'm responsible for stopping/terminating it.</span>
              </label>
              <div class="confirm-actions">
                <button id="confirm-launch-btn" type="button" class="btn-primary" ${this.#confirmChecked ? "" : "disabled"}>Confirm Launch</button>
                <button id="cancel-launch-btn" type="button" class="btn-secondary">Cancel</button>
              </div>
            </div>`
          : ""
      }
      ${this.#launchError ? `<p class="error-text">⚠️ ${escapeHtml(this.#launchError)}</p>` : ""}

      <p class="section-title">Monitor</p>
      <div id="instances-list"></div>
    `;

    const instanceTypeSelect = this.#root.querySelector<HTMLSelectElement>("#instanceType")!;
    instanceTypeSelect.addEventListener("change", () => {
      this.#root.querySelector<HTMLElement>("#cost-hint")!.textContent = formatEc2HourlyEstimate(instanceTypeSelect.value);
    });

    this.#root.querySelector<HTMLButtonElement>("#launch-btn")!.addEventListener("click", () => {
      // Read the Configure form NOW - render()'s own re-render below
      // (triggered by #confirmingLaunch flipping true) rebuilds every
      // input from scratch with no preserved value, so reading them
      // afterward (e.g. inside #confirm-launch-btn's own handler) would
      // silently read back empty strings instead of what was typed.
      const val = (id: string) => (this.#root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)?.value ?? "").trim();
      this.#pendingLaunchConfig = {
        imageId: val("imageId"),
        instanceType: val("instanceType"),
        ...(val("keyName") ? { keyName: val("keyName") } : {}),
        ...(val("userData") ? { userData: val("userData") } : {}),
        ...(val("iamInstanceProfileName") ? { iamInstanceProfileName: val("iamInstanceProfileName") } : {}),
      };
      this.#confirmingLaunch = true;
      this.#confirmChecked = false;
      this.render();
    });
    const confirmCheck = this.#root.querySelector<HTMLInputElement>("#confirm-check");
    if (confirmCheck) {
      confirmCheck.addEventListener("change", () => {
        this.#confirmChecked = confirmCheck.checked;
        this.render();
      });
    }
    const confirmBtn = this.#root.querySelector<HTMLButtonElement>("#confirm-launch-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (this.#pendingLaunchConfig) {
          void this.#handleLaunch(this.#pendingLaunchConfig);
        }
      });
    }
    const cancelBtn = this.#root.querySelector<HTMLButtonElement>("#cancel-launch-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.#confirmingLaunch = false;
        this.#pendingLaunchConfig = null;
        this.render();
      });
    }

    const listEl = this.#root.querySelector<HTMLElement>("#instances-list")!;
    if (this.#loadingInstances) {
      listEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    } else if (this.#loadError) {
      listEl.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(this.#loadError)}</p>`;
    } else if (!this.#instances || this.#instances.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No instances yet - launch one above.</p>`;
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
                    <textarea id="redeploy-script" rows="4" placeholder="systemctl restart myapp"></textarea>
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
      listEl.querySelectorAll<HTMLButtonElement>("button[data-send-command]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const instanceId = btn.dataset["sendCommand"]!;
          const script = this.#root.querySelector<HTMLTextAreaElement>("#redeploy-script")?.value ?? "";
          const commands = script.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
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

if (typeof customElements !== "undefined" && !customElements.get("control-ec2-provisioning")) {
  customElements.define("control-ec2-provisioning", Ec2ProvisioningControl);
}
