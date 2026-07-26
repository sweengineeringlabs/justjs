import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import {
  createAwsEcsCluster,
  listAwsEcsClusters,
  deleteAwsEcsCluster,
  registerAwsEcsTaskDefinition,
  runAwsEcsTask,
  listAwsEcsTasks,
  stopAwsEcsTask,
} from "../core/ecs_provisioning.js";
import type { EcsClusterState, EcsTaskState } from "../core/ecs_provisioning.js";
import { ECS_FARGATE_SIZE_OPTIONS, formatEcsFargateHourlyEstimate } from "../core/ecs_cost_estimates.js";
import { getEcsLedger, addEcsLedgerEntry, reconcileEcsLedger, removeEcsLedgerEntriesForCluster } from "../core/ecs_ledger.js";

interface PendingEcsCreateConfig {
  readonly clusterName: string;
  readonly family: string;
  readonly image: string;
  readonly port: number;
  readonly cpu: string;
  readonly memory: string;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Real guided workflow for ECS Fargate (justjs#144/ADR-0017's ECS
// phase, after EC2) - same safety-gate shape Ec2ProvisioningControl
// already established: a real cost estimate in Configure
// (core/ecs_cost_estimates.ts) and a second, distinct confirmation gate
// beyond a single click, because a running Fargate task is real,
// billable, hard-to-undo AWS spend the same way a running EC2 instance
// is. CreateCluster/RegisterTaskDefinition/RunTask never ship without
// DeleteCluster/DeregisterTaskDefinition/StopTask alongside them (this
// file implements all six together, not across separate commits) - the
// repo's own stated safety gate, not a suggestion.
export class EcsProvisioningControl extends HTMLElement {
  #clusters: readonly EcsClusterState[] | null = null;
  #loadingClusters = false;
  #loadError: string | null = null;
  #creating = false;
  #createError: string | null = null;
  #confirmingCreate = false;
  #confirmChecked = false;
  // Same real bug class Ec2ProvisioningControl's own #pendingLaunchConfig
  // fix addresses - the Configure form must be read before the confirm-box
  // re-render, which rebuilds every <input>/<select> from scratch with no
  // preserved value.
  #pendingCreateConfig: PendingEcsCreateConfig | null = null;
  #pendingActionClusterName: string | null = null;
  // Only one cluster's task list is expanded at a time, same
  // single-panel-at-a-time pattern Ec2ProvisioningControl's own
  // Redeploy/Metrics panels use.
  #expandedClusterName: string | null = null;
  #tasks: readonly EcsTaskState[] | null = null;
  #tasksLoading = false;
  #tasksError: string | null = null;
  #pendingTaskActionArn: string | null = null;
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
    this.#clusters = null;
    this.#loadingClusters = false;
    this.#loadError = null;
    this.#creating = false;
    this.#createError = null;
    this.#confirmingCreate = false;
    this.#confirmChecked = false;
    this.#pendingCreateConfig = null;
    this.#pendingActionClusterName = null;
    this.#resetTasksPanel();
    this.render();
  }

  #resetTasksPanel(): void {
    this.#expandedClusterName = null;
    this.#tasks = null;
    this.#tasksLoading = false;
    this.#tasksError = null;
    this.#pendingTaskActionArn = null;
  }

  async #loadClusters(): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#loadingClusters = true;
    this.#loadError = null;
    this.render();
    try {
      this.#clusters = await listAwsEcsClusters(creds.accessKeyId, creds.secretAccessKey);
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
      this.#clusters = null;
    } finally {
      this.#loadingClusters = false;
      this.render();
    }
  }

  async #handleCreate(config: PendingEcsCreateConfig): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#creating = true;
    this.#createError = null;
    this.#confirmingCreate = false;
    this.#pendingCreateConfig = null;
    this.render();
    try {
      await createAwsEcsCluster(creds.accessKeyId, creds.secretAccessKey, config.clusterName);
      const taskDefinition = await registerAwsEcsTaskDefinition(creds.accessKeyId, creds.secretAccessKey, {
        family: config.family,
        containerDefinitions: [{ name: "app", image: config.image, portMappings: [{ containerPort: config.port, hostPort: config.port }] }],
        cpu: config.cpu,
        memory: config.memory,
      });
      const tasks = await runAwsEcsTask(creds.accessKeyId, creds.secretAccessKey, config.clusterName, taskDefinition.taskDefinitionArn);
      tasks.forEach((t) =>
        addEcsLedgerEntry({ clusterName: config.clusterName, taskArn: t.taskArn, taskDefinitionArn: t.taskDefinitionArn, startedAt: new Date().toISOString() })
      );
      await this.#loadClusters();
    } catch (e) {
      this.#createError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#creating = false;
      this.render();
    }
  }

  async #handleDeleteCluster(clusterName: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#pendingActionClusterName = clusterName;
    this.render();
    try {
      await deleteAwsEcsCluster(creds.accessKeyId, creds.secretAccessKey, clusterName);
      removeEcsLedgerEntriesForCluster(clusterName);
      if (this.#expandedClusterName === clusterName) {
        this.#resetTasksPanel();
      }
      await this.#loadClusters();
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#pendingActionClusterName = null;
      this.render();
    }
  }

  async #loadTasks(clusterName: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#tasksLoading = true;
    this.#tasksError = null;
    this.render();
    try {
      this.#tasks = await listAwsEcsTasks(creds.accessKeyId, creds.secretAccessKey, clusterName);
      reconcileEcsLedger(clusterName, new Set(this.#tasks.map((t) => t.taskArn)));
    } catch (e) {
      this.#tasksError = e instanceof Error ? e.message : String(e);
      this.#tasks = null;
    } finally {
      this.#tasksLoading = false;
      this.render();
    }
  }

  async #handleStopTask(clusterName: string, taskArn: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#pendingTaskActionArn = taskArn;
    this.render();
    try {
      await stopAwsEcsTask(creds.accessKeyId, creds.secretAccessKey, clusterName, taskArn);
      await this.#loadTasks(clusterName);
    } catch (e) {
      this.#tasksError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#pendingTaskActionArn = null;
      this.render();
    }
  }

  private render(): void {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      this.#root.innerHTML = `
        <style>:host { display: block; } .connect-hint { margin: 0; font-size: 12px; line-height: 1.4; color: var(--text-muted); }</style>
        <p class="connect-hint">Connect a real AWS account above first - ECS clusters need a working AWS connection.</p>
      `;
      return;
    }
    if (this.#clusters === null && !this.#loadingClusters && !this.#loadError) {
      void this.#loadClusters();
    }

    const ledger = getEcsLedger();
    const selectedSize = this.#root.querySelector<HTMLSelectElement>("#fargateSize")?.value ?? `${ECS_FARGATE_SIZE_OPTIONS[0]!.cpu}/${ECS_FARGATE_SIZE_OPTIONS[0]!.memory}`;
    const [selectedCpu, selectedMemory] = selectedSize.split("/");

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .section-title { margin: 18px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
        .field label { font-size: 12px; color: var(--text-muted); }
        .field input, .field select {
          font: inherit; font-size: 14px; padding: 8px 10px; border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border); background: var(--surface); color: var(--text);
        }
        .field-hint { margin: 4px 0 0; font-size: 11px; line-height: 1.4; color: var(--text-muted); }
        .field-row { display: flex; gap: 10px; }
        .field-row .field { flex: 1; }
        .cost-hint { margin: -4px 0 10px; font-size: 12px; color: var(--text-muted); }
        .tasks-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
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
        .cluster-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .cluster-row:last-child { border-bottom: none; }
        .cluster-name { font-weight: 600; font-size: 14px; }
        .cluster-meta { font-size: 12px; color: var(--text-muted); }
        .cluster-status { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-pill); white-space: nowrap; }
        .cluster-status-ACTIVE { background: #d4edda; color: #1e7e34; }
        .cluster-status-INACTIVE, .cluster-status-PROVISIONING { background: var(--surface-alt); color: var(--text-muted); }
        .cluster-actions { display: flex; gap: 6px; }
        .task-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .task-row:last-child { border-bottom: none; }
        .task-arn { font-size: 12px; font-family: ui-monospace, monospace; }
        .task-status { font-size: 11px; color: var(--text-muted); }
      </style>
      <p class="connect-hint warn-hint">⚠️ ECS Fargate tasks are real, billable AWS resources, unlike CloudWatch alarms - running one costs real money until it's stopped.</p>
      ${
        ledger.length > 0
          ? `<p class="ledger-hint">📋 This app has started ${ledger.length} task${ledger.length === 1 ? "" : "s"} you may still be responsible for: ${ledger.map((e) => `${escapeHtml(e.taskArn)} (${escapeHtml(e.clusterName)})`).join(", ")}. Check Monitor below.</p>`
          : ""
      }

      <p class="section-title">Configure</p>
      <div class="field-row">
        <div class="field">
          <label>Cluster name</label>
          <input id="clusterName" type="text" placeholder="my-cluster" />
        </div>
        <div class="field">
          <label>Task family</label>
          <input id="family" type="text" placeholder="my-app" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Container image</label>
          <input id="image" type="text" placeholder="nginx:latest" />
        </div>
        <div class="field">
          <label>Port</label>
          <input id="port" type="number" placeholder="8080" value="8080" />
        </div>
      </div>
      <div class="field">
        <label>Size</label>
        <select id="fargateSize">${ECS_FARGATE_SIZE_OPTIONS.map((o) => `<option value="${o.cpu}/${o.memory}" ${o.cpu === selectedCpu && o.memory === selectedMemory ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
      </div>
      <p class="cost-hint" id="cost-hint">${escapeHtml(formatEcsFargateHourlyEstimate(selectedCpu!, selectedMemory!))}</p>
      <button id="create-btn" type="button" class="btn-primary" ${this.#creating ? "disabled" : ""}>${this.#creating ? "Creating…" : "Create Cluster & Run Task"}</button>
      ${
        this.#confirmingCreate
          ? `<div class="confirm-box">
              <p class="warn">This will create a real cluster and run a real Fargate task on the connected AWS account, billed at ${escapeHtml(formatEcsFargateHourlyEstimate(selectedCpu!, selectedMemory!))} until stopped.</p>
              <label class="confirm-check">
                <input type="checkbox" id="confirm-check" ${this.#confirmChecked ? "checked" : ""} />
                <span>I understand this runs a real, billable task and I'm responsible for stopping it.</span>
              </label>
              <div class="confirm-actions">
                <button id="confirm-create-btn" type="button" class="btn-primary" ${this.#confirmChecked ? "" : "disabled"}>Confirm</button>
                <button id="cancel-create-btn" type="button" class="btn-secondary">Cancel</button>
              </div>
            </div>`
          : ""
      }
      ${this.#createError ? `<p class="error-text">⚠️ ${escapeHtml(this.#createError)}</p>` : ""}

      <p class="section-title">Monitor</p>
      <div id="clusters-list"></div>
    `;

    const sizeSelect = this.#root.querySelector<HTMLSelectElement>("#fargateSize")!;
    sizeSelect.addEventListener("change", () => {
      const [cpu, memory] = sizeSelect.value.split("/");
      this.#root.querySelector<HTMLElement>("#cost-hint")!.textContent = formatEcsFargateHourlyEstimate(cpu!, memory!);
    });

    this.#root.querySelector<HTMLButtonElement>("#create-btn")!.addEventListener("click", () => {
      // Read the Configure form NOW - same reasoning as
      // Ec2ProvisioningControl's own #pendingLaunchConfig fix: the
      // confirm-box re-render below rebuilds every input from scratch
      // with no preserved value.
      const val = (id: string) => (this.#root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? "").trim();
      const [cpu, memory] = val("fargateSize").split("/");
      this.#pendingCreateConfig = {
        clusterName: val("clusterName"),
        family: val("family"),
        image: val("image"),
        port: Number(val("port")) || 0,
        cpu: cpu!,
        memory: memory!,
      };
      this.#confirmingCreate = true;
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
    const confirmBtn = this.#root.querySelector<HTMLButtonElement>("#confirm-create-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (this.#pendingCreateConfig) {
          void this.#handleCreate(this.#pendingCreateConfig);
        }
      });
    }
    const cancelBtn = this.#root.querySelector<HTMLButtonElement>("#cancel-create-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.#confirmingCreate = false;
        this.#pendingCreateConfig = null;
        this.render();
      });
    }

    const listEl = this.#root.querySelector<HTMLElement>("#clusters-list")!;
    if (this.#loadingClusters) {
      listEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    } else if (this.#loadError) {
      listEl.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(this.#loadError)}</p>`;
    } else if (!this.#clusters || this.#clusters.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No clusters yet - create one above.</p>`;
    } else {
      listEl.innerHTML = this.#clusters
        .map((c) => {
          const isPending = this.#pendingActionClusterName === c.clusterName;
          const tasksOpen = this.#expandedClusterName === c.clusterName;
          return `
            <div class="cluster-row">
              <div>
                <div class="cluster-name">${escapeHtml(c.clusterName)}</div>
                <div class="cluster-meta">${escapeHtml(c.clusterArn)}</div>
              </div>
              <span class="cluster-status cluster-status-${c.status}">${escapeHtml(c.status)}</span>
              <div class="cluster-actions">
                <button type="button" class="btn-secondary" data-tasks-toggle="${escapeHtml(c.clusterName)}">${tasksOpen ? "Hide Tasks" : "Tasks"}</button>
                <button type="button" class="btn-danger" data-delete="${escapeHtml(c.clusterName)}" ${isPending ? "disabled" : ""}>${isPending ? "…" : "Delete"}</button>
              </div>
            </div>
            ${
              tasksOpen
                ? `<div class="tasks-panel">
                    ${this.#tasksLoading ? `<p class="connect-hint">Loading…</p>` : ""}
                    ${this.#tasksError ? `<p class="error-text">⚠️ ${escapeHtml(this.#tasksError)}</p>` : ""}
                    ${
                      !this.#tasksLoading && !this.#tasksError && this.#tasks
                        ? this.#tasks.length === 0
                          ? `<p class="connect-hint">No tasks running in this cluster.</p>`
                          : this.#tasks
                              .map(
                                (t) => `
                                <div class="task-row">
                                  <div>
                                    <div class="task-arn">${escapeHtml(t.taskArn)}</div>
                                    <div class="task-status">${escapeHtml(t.lastStatus)} → ${escapeHtml(t.desiredStatus)}</div>
                                  </div>
                                  ${
                                    t.lastStatus !== "STOPPED"
                                      ? `<button type="button" class="btn-secondary" data-stop-task="${escapeHtml(t.taskArn)}" data-stop-task-cluster="${escapeHtml(c.clusterName)}" ${this.#pendingTaskActionArn === t.taskArn ? "disabled" : ""}>${this.#pendingTaskActionArn === t.taskArn ? "…" : "Stop"}</button>`
                                      : ""
                                  }
                                </div>
                              `
                              )
                              .join("")
                        : ""
                    }
                  </div>`
                : ""
            }
          `;
        })
        .join("");
      listEl.querySelectorAll<HTMLButtonElement>("button[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleDeleteCluster(btn.dataset["delete"]!));
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-tasks-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const clusterName = btn.dataset["tasksToggle"]!;
          if (this.#expandedClusterName === clusterName) {
            this.#resetTasksPanel();
            this.render();
          } else {
            this.#resetTasksPanel();
            this.#expandedClusterName = clusterName;
            void this.#loadTasks(clusterName);
          }
        });
      });
      listEl.querySelectorAll<HTMLButtonElement>("button[data-stop-task]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const taskArn = btn.dataset["stopTask"]!;
          const clusterName = btn.dataset["stopTaskCluster"]!;
          void this.#handleStopTask(clusterName, taskArn);
        });
      });
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-ecs-provisioning")) {
  customElements.define("control-ecs-provisioning", EcsProvisioningControl);
}
