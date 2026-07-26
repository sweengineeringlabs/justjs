import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import { listAwsCloudWatchAlarms, deleteAwsCloudWatchAlarm } from "../core/cloud_provisioning.js";
import type { CloudWatchAlarmState } from "../core/cloud_provisioning.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Real Monitor half of what used to be CloudProvisioningControl's one
// combined Configure+Monitor screen (justjs#151's Deployment/Operations
// split) - list/delete already-created CloudWatch alarms. Lives under
// Operations -> Monitoring now, not Deployment -> Cloud, since managing
// what's already running is an operational concern, not a deploy one.
// CloudWatch alarms have no persisted "ledger" the way EC2/ECS do - an
// alarm is free and instantly deletable, so there's nothing this control
// needs to remind the user they're still responsible for.
export class AlarmMonitorControl extends HTMLElement {
  #alarms: readonly CloudWatchAlarmState[] | null = null;
  #loadingAlarms = false;
  #loadError: string | null = null;
  #deletingAlarmName: string | null = null;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.render();
  }

  resetView(): void {
    this.#alarms = null;
    this.#loadingAlarms = false;
    this.#loadError = null;
    this.#deletingAlarmName = null;
    this.render();
  }

  async #loadAlarms(): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#loadingAlarms = true;
    this.#loadError = null;
    this.render();
    try {
      this.#alarms = await listAwsCloudWatchAlarms(creds.accessKeyId, creds.secretAccessKey);
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
      this.#alarms = null;
    } finally {
      this.#loadingAlarms = false;
      this.render();
    }
  }

  async #handleDelete(alarmName: string): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#deletingAlarmName = alarmName;
    this.render();
    try {
      await deleteAwsCloudWatchAlarm(creds.accessKeyId, creds.secretAccessKey, alarmName);
      await this.#loadAlarms();
    } catch (e) {
      this.#loadError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#deletingAlarmName = null;
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
    if (this.#alarms === null && !this.#loadingAlarms && !this.#loadError) {
      void this.#loadAlarms();
    }

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        button.btn-danger {
          border: none; padding: 10px 18px; font-size: 14px; font-family: inherit; font-weight: 600;
          border-radius: var(--radius-pill); cursor: pointer; transition: opacity 0.15s ease, transform 0.05s ease;
          background: var(--surface-alt); color: #c0392b;
        }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        .error-text { color: #c0392b; font-size: 12px; margin: 8px 0 0; }
        .alarm-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .alarm-row:last-child { border-bottom: none; }
        .alarm-name { font-weight: 600; font-size: 14px; }
        .alarm-meta { font-size: 12px; color: var(--text-muted); }
        .alarm-state { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-pill); white-space: nowrap; }
        .alarm-state-ok { background: #d4edda; color: #1e7e34; }
        .alarm-state-alarm { background: #f8d7da; color: #c0392b; }
        .alarm-state-insufficient_data { background: var(--surface-alt); color: var(--text-muted); }
      </style>
      <div id="alarms-list"></div>
    `;

    const listEl = this.#root.querySelector<HTMLElement>("#alarms-list")!;
    if (this.#loadingAlarms) {
      listEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    } else if (this.#loadError) {
      listEl.innerHTML = `<p class="error-text">⚠️ ${escapeHtml(this.#loadError)}</p>`;
    } else if (!this.#alarms || this.#alarms.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No alarms yet - create one in Deployment → Cloud.</p>`;
    } else {
      listEl.innerHTML = this.#alarms
        .map(
          (a) => `
            <div class="alarm-row">
              <div>
                <div class="alarm-name">${escapeHtml(a.alarmName)}</div>
                <div class="alarm-meta">${escapeHtml(a.namespace)} · ${escapeHtml(a.metricName)} ${escapeHtml(a.comparisonOperator)} ${a.threshold}</div>
              </div>
              <span class="alarm-state alarm-state-${a.stateValue.toLowerCase()}">${escapeHtml(a.stateValue)}</span>
              <button type="button" class="btn-danger" data-delete="${escapeHtml(a.alarmName)}" ${this.#deletingAlarmName === a.alarmName ? "disabled" : ""}>${this.#deletingAlarmName === a.alarmName ? "Deleting…" : "Delete"}</button>
            </div>
          `
        )
        .join("");
      listEl.querySelectorAll<HTMLButtonElement>("button[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => void this.#handleDelete(btn.dataset["delete"]!));
      });
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-alarm-monitor")) {
  customElements.define("control-alarm-monitor", AlarmMonitorControl);
}
