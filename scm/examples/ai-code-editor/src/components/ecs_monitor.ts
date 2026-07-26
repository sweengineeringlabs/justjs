import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import { listAwsEcsClusters, deleteAwsEcsCluster, listAwsEcsTasks, stopAwsEcsTask } from "../core/ecs_provisioning.js";
import type { EcsClusterState, EcsTaskState } from "../core/ecs_provisioning.js";
import { getEcsLedger, reconcileEcsLedger, removeEcsLedgerEntriesForCluster } from "../core/ecs_ledger.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Real Monitor half of what used to be EcsProvisioningControl's one
// combined Configure+Monitor screen (justjs#151's Deployment/Operations
// split) - list/delete clusters, list/stop tasks. Lives under
// Operations -> Monitoring now, not Deployment -> Cloud - managing
// what's already running (and possibly still billing) is an
// operational concern, not a deploy one. Creating a cluster/running a
// task happens in EcsProvisioningControl (Deployment -> Cloud ->
// Clusters); this control never creates either, only acts on what
// already exists.
export class EcsMonitorControl extends HTMLElement {
  #clusters: readonly EcsClusterState[] | null = null;
  #loadingClusters = false;
  #loadError: string | null = null;
  #pendingActionClusterName: string | null = null;
  // Only one cluster's task list is expanded at a time, same
  // single-panel-at-a-time pattern Ec2MonitorControl's own Redeploy/
  // Metrics panels use.
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

  resetView(): void {
    this.#clusters = null;
    this.#loadingClusters = false;
    this.#loadError = null;
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
        <p class="connect-hint">Connect a real AWS account first - see Deployment → Cloud.</p>
      `;
      return;
    }
    if (this.#clusters === null && !this.#loadingClusters && !this.#loadError) {
      void this.#loadClusters();
    }

    const ledger = getEcsLedger();

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .tasks-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        button.btn-secondary, button.btn-danger {
          border: none; padding: 10px 18px; font-size: 14px; font-family: inherit; font-weight: 600;
          border-radius: var(--radius-pill); cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.btn-secondary { background: var(--surface-alt); color: var(--text); }
        button.btn-danger { background: var(--surface-alt); color: #c0392b; }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
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
      ${
        ledger.length > 0
          ? `<p class="ledger-hint">📋 This app has started ${ledger.length} task${ledger.length === 1 ? "" : "s"} you may still be responsible for: ${ledger.map((e) => `${escapeHtml(e.taskArn)} (${escapeHtml(e.clusterName)})`).join(", ")}.</p>`
          : ""
      }
      <div id="clusters-list"></div>
    `;

    const listEl = this.#root.querySelector<HTMLElement>("#clusters-list")!;
    if (this.#loadingClusters) {
      listEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    } else if (this.#loadError) {
      listEl.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(this.#loadError)}</p>`;
    } else if (!this.#clusters || this.#clusters.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No clusters yet - create one in Deployment → Cloud.</p>`;
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

if (typeof customElements !== "undefined" && !customElements.get("control-ecs-monitor")) {
  customElements.define("control-ecs-monitor", EcsMonitorControl);
}
