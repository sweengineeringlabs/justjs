import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import { putAwsCloudWatchAlarm } from "../core/cloud_provisioning.js";
import type { CloudWatchAlarmConfig } from "../core/cloud_provisioning.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const STATISTICS: readonly CloudWatchAlarmConfig["statistic"][] = ["Average", "Sum", "Minimum", "Maximum", "SampleCount"];
const COMPARISONS: readonly { readonly value: CloudWatchAlarmConfig["comparisonOperator"]; readonly label: string }[] = [
  { value: "GreaterThanThreshold", label: "greater than" },
  { value: "GreaterThanOrEqualToThreshold", label: "greater than or equal to" },
  { value: "LessThanThreshold", label: "less than" },
  { value: "LessThanOrEqualToThreshold", label: "less than or equal to" },
];
const PERIODS: readonly number[] = [60, 300, 900, 3600];

// Real guided workflow (connect -> configure -> deploy) for AWS
// CloudWatch alarms - the pilot service for this app's cloud
// provisioning feature. Configure/Create only (justjs#151's Deployment/
// Operations split) - listing/deleting already-created alarms moved to
// AlarmMonitorControl under Operations -> Monitoring, a real, separate
// custom element on a different SDLC stage now, not a sibling section
// in this same shadow root. Chosen as the pilot because an alarm is
// free and instantly deletable even against a real AWS account - no
// other action this app could take against AWS has that property,
// which is why this shipped before EC2/ECS/EKS provisioning (those
// need real cost disclosure + a proven destroy path first).
export class CloudProvisioningControl extends HTMLElement {
  #creating = false;
  #createError: string | null = null;
  #createSuccessMessage: string | null = null;
  #confirmingCreate = false;
  // Real bug found via live UI verification (justjs#151's own split
  // testing) - render()'s own re-render below (triggered by
  // #confirmingCreate flipping true) rebuilds the entire Configure
  // form's HTML from scratch, and none of the plain <input>/<select>
  // elements carry a `value` reflecting what the user typed - so
  // reading the form inside #confirm-create-btn's own handler (which
  // runs after that re-render) silently read back empty strings. This
  // is the exact same bug class ec2_provisioning.ts's/ecs_provisioning.ts's
  // own #pendingLaunchConfig/#pendingCreateConfig fixes address - fixed
  // here the same way: read the form once, in the "Create Alarm" click
  // handler itself, before the confirm-box re-render happens.
  #pendingCreateConfig: CloudWatchAlarmConfig | null = null;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.render();
  }

  // Real reset back to a fresh Configure form - same reset-on-navigate-
  // away need every other cached control in this app has (justjs#138/
  // #139's own resetView() precedent).
  resetView(): void {
    this.#creating = false;
    this.#createError = null;
    this.#createSuccessMessage = null;
    this.#confirmingCreate = false;
    this.#pendingCreateConfig = null;
    this.render();
  }

  async #handleCreate(config: CloudWatchAlarmConfig): Promise<void> {
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
      await putAwsCloudWatchAlarm(creds.accessKeyId, creds.secretAccessKey, config);
      this.#createSuccessMessage = `Alarm "${config.alarmName}" created - check Operations → Monitoring to view or delete it.`;
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
        <p class="connect-hint">Connect a real AWS account above first - CloudWatch alarms need a working AWS connection.</p>
      `;
      return;
    }

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
        .confirm-actions { display: flex; gap: 10px; }
        .error-text { color: #c0392b; font-size: 12px; margin: 8px 0 0; }
        .success-text { color: #1e7e34; font-size: 12px; margin: 8px 0 0; }
      </style>
      <p class="connect-hint">CloudWatch alarms are free to create and instantly deletable - a safe first real AWS action, unlike EC2/ECS which cost real money the moment they're created.</p>

      <p class="section-title">Configure</p>
      <div class="field">
        <label>Alarm name</label>
        <input id="alarmName" type="text" placeholder="high-cpu" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Namespace</label>
          <input id="namespace" type="text" placeholder="AWS/EC2" value="AWS/EC2" />
        </div>
        <div class="field">
          <label>Metric name</label>
          <input id="metricName" type="text" placeholder="CPUUtilization" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Statistic</label>
          <select id="statistic">${STATISTICS.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Period (seconds)</label>
          <select id="period">${PERIODS.map((p) => `<option value="${p}">${p}</option>`).join("")}</select>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Comparison</label>
          <select id="comparisonOperator">${COMPARISONS.map((c) => `<option value="${c.value}">${escapeHtml(c.label)}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Threshold</label>
          <input id="threshold" type="number" placeholder="80" />
        </div>
        <div class="field">
          <label>Evaluation periods</label>
          <input id="evaluationPeriods" type="number" placeholder="2" value="2" />
        </div>
      </div>
      <div class="field">
        <label>Description (optional)</label>
        <input id="alarmDescription" type="text" placeholder="Alerts when CPU stays high" />
      </div>
      <button id="create-btn" type="button" class="btn-primary" ${this.#creating ? "disabled" : ""}>${this.#creating ? "Creating…" : "Create Alarm"}</button>
      ${
        this.#confirmingCreate
          ? `<div class="confirm-box">
              <p>Create this alarm on the connected AWS account? It's free and can be deleted any time from Operations → Monitoring.</p>
              <div class="confirm-actions">
                <button id="confirm-create-btn" type="button" class="btn-primary">Confirm Create</button>
                <button id="cancel-create-btn" type="button" class="btn-secondary">Cancel</button>
              </div>
            </div>`
          : ""
      }
      ${this.#createError ? `<p class="error-text">⚠️ ${escapeHtml(this.#createError)}</p>` : ""}
      ${this.#createSuccessMessage ? `<p class="success-text">✅ ${escapeHtml(this.#createSuccessMessage)}</p>` : ""}
    `;

    this.#root.querySelector<HTMLButtonElement>("#create-btn")!.addEventListener("click", () => {
      // Read the Configure form NOW - render()'s own re-render below
      // (triggered by #confirmingCreate flipping true) rebuilds every
      // input from scratch with no preserved value, so reading them
      // afterward (e.g. inside #confirm-create-btn's own handler) would
      // silently read back empty strings instead of what was typed.
      const val = (id: string) => (this.#root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? "").trim();
      this.#pendingCreateConfig = {
        alarmName: val("alarmName"),
        namespace: val("namespace"),
        metricName: val("metricName"),
        statistic: val("statistic") as CloudWatchAlarmConfig["statistic"],
        period: Number(val("period")),
        comparisonOperator: val("comparisonOperator") as CloudWatchAlarmConfig["comparisonOperator"],
        threshold: Number(val("threshold")),
        evaluationPeriods: Number(val("evaluationPeriods")),
        ...(val("alarmDescription") ? { alarmDescription: val("alarmDescription") } : {}),
      };
      this.#confirmingCreate = true;
      this.render();
    });
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

if (typeof customElements !== "undefined" && !customElements.get("control-cloud-provisioning")) {
  customElements.define("control-cloud-provisioning", CloudProvisioningControl);
}
