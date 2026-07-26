import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import { createAwsEcsCluster, registerAwsEcsTaskDefinition, runAwsEcsTask } from "../core/ecs_provisioning.js";
import { ECS_FARGATE_SIZE_OPTIONS, formatEcsFargateHourlyEstimate } from "../core/ecs_cost_estimates.js";
import { addEcsLedgerEntry } from "../core/ecs_ledger.js";

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
// phase) - Configure/Create only (justjs#151's Deployment/Operations
// split). Listing/deleting clusters and listing/stopping tasks moved
// to EcsMonitorControl under Operations -> Monitoring, a real, separate
// custom element on a different SDLC stage now. A running Fargate task
// is real, billable, hard-to-undo AWS spend the same way a running EC2
// instance is, so this control keeps the same safety-gate shape
// Ec2ProvisioningControl already established: a real cost estimate in
// Configure (core/ecs_cost_estimates.ts) and a second, distinct
// confirmation gate beyond a single click.
export class EcsProvisioningControl extends HTMLElement {
  #creating = false;
  #createError: string | null = null;
  #createSuccessMessage: string | null = null;
  #confirmingCreate = false;
  #confirmChecked = false;
  // Same real bug class Ec2ProvisioningControl's own #pendingLaunchConfig
  // fix addresses - the Configure form must be read before the confirm-box
  // re-render, which rebuilds every <input>/<select> from scratch with no
  // preserved value.
  #pendingCreateConfig: PendingEcsCreateConfig | null = null;
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
    this.#creating = false;
    this.#createError = null;
    this.#createSuccessMessage = null;
    this.#confirmingCreate = false;
    this.#confirmChecked = false;
    this.#pendingCreateConfig = null;
    this.render();
  }

  async #handleCreate(config: PendingEcsCreateConfig): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#creating = true;
    this.#createError = null;
    this.#createSuccessMessage = null;
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
      this.#createSuccessMessage = `Cluster "${config.clusterName}" created and task running - check Operations → Monitoring to manage it.`;
    } catch (e) {
      this.#createError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#creating = false;
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
        .field-row { display: flex; gap: 10px; }
        .field-row .field { flex: 1; }
        .cost-hint { margin: -4px 0 10px; font-size: 12px; color: var(--text-muted); }
        button.btn-primary, button.btn-secondary {
          border: none; padding: 10px 18px; font-size: 14px; font-family: inherit; font-weight: 600;
          border-radius: var(--radius-pill); cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.btn-primary { background: var(--accent-strong, var(--accent)); color: white; }
        button.btn-secondary { background: var(--surface-alt); color: var(--text); }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        .confirm-box { margin: 10px 0 0; padding: 12px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .confirm-box p { margin: 0 0 10px; font-size: 13px; }
        .confirm-box .warn { font-weight: 600; color: #c0392b; }
        .confirm-check { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 12px; font-size: 13px; }
        .confirm-actions { display: flex; gap: 10px; }
        .error-text { color: #c0392b; font-size: 12px; margin: 8px 0 0; }
        .success-text { color: #1e7e34; font-size: 12px; margin: 8px 0 0; }
      </style>
      <p class="connect-hint warn-hint">⚠️ ECS Fargate tasks are real, billable AWS resources, unlike CloudWatch alarms - running one costs real money until it's stopped.</p>

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
      ${this.#createSuccessMessage ? `<p class="success-text">✅ ${escapeHtml(this.#createSuccessMessage)}</p>` : ""}
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
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-ecs-provisioning")) {
  customElements.define("control-ecs-provisioning", EcsProvisioningControl);
}
