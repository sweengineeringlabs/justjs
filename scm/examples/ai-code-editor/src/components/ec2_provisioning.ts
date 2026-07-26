import { getStoredAwsCredentials } from "../core/cloud_credentials.js";
import { runAwsEc2Instance } from "../core/ec2_provisioning.js";
import type { Ec2InstanceConfig } from "../core/ec2_provisioning.js";
import { EC2_INSTANCE_TYPE_OPTIONS, formatEc2HourlyEstimate } from "../core/ec2_cost_estimates.js";
import { addEc2LedgerEntry } from "../core/ec2_ledger.js";
import { generateGitRepoUserData, generateContainerImageUserData } from "../core/ec2_deploy_templates.js";

type DeployMode = "raw" | "git" | "container";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Real guided workflow (connect -> configure -> deploy) for AWS EC2
// instances (justjs#144/ADR-0017) - Configure/Launch only (justjs#151's
// Deployment/Operations split). Listing/starting/stopping/terminating/
// redeploying already-launched instances moved to Ec2MonitorControl
// under Operations -> Monitoring, a real, separate custom element on a
// different SDLC stage now. Unlike an alarm, RunInstances is real,
// billable, hard-to-undo AWS spend, so this control still has a real
// cost estimate in Configure (core/ec2_cost_estimates.ts) and a second,
// distinct confirmation gate beyond a single click - an explicit "I
// understand" checkbox that must be checked before Confirm Launch is
// even enabled, not just a second button press.
export class Ec2ProvisioningControl extends HTMLElement {
  #launching = false;
  #launchError: string | null = null;
  #launchSuccessMessage: string | null = null;
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
  // ADR-0020/justjs#149 - guided deploy-input modes for Configure's
  // userData, generating the script instead of asking for hand-written
  // shell every time.
  #deployMode: DeployMode = "raw";
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
    this.#launching = false;
    this.#launchError = null;
    this.#launchSuccessMessage = null;
    this.#confirmingLaunch = false;
    this.#confirmChecked = false;
    this.#pendingLaunchConfig = null;
    this.#deployMode = "raw";
    this.render();
  }

  async #handleLaunch(config: Ec2InstanceConfig): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.#launching = true;
    this.#launchError = null;
    this.#launchSuccessMessage = null;
    this.#confirmingLaunch = false;
    this.#pendingLaunchConfig = null;
    this.render();
    try {
      const instance = await runAwsEc2Instance(creds.accessKeyId, creds.secretAccessKey, config);
      addEc2LedgerEntry({ instanceId: instance.instanceId, instanceType: instance.instanceType, launchedAt: instance.launchTime });
      this.#launchSuccessMessage = `Instance "${instance.instanceId}" launched - check Operations → Monitoring to manage it.`;
    } catch (e) {
      this.#launchError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#launching = false;
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
        .userdata-preview { white-space: pre-wrap; word-break: break-word; background: var(--surface); padding: 8px; border-radius: var(--radius-md, 8px); margin: 8px 0 0; font-family: ui-monospace, monospace; font-size: 11px; }
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
      <p class="connect-hint warn-hint">⚠️ EC2 instances are real, billable AWS resources, unlike CloudWatch alarms - launching one costs real money until it's stopped or terminated.</p>

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
        <label>Deploy mode</label>
        <select id="deployMode">
          <option value="raw" ${this.#deployMode === "raw" ? "selected" : ""}>Raw script</option>
          <option value="git" ${this.#deployMode === "git" ? "selected" : ""}>Git repo</option>
          <option value="container" ${this.#deployMode === "container" ? "selected" : ""}>Container image</option>
        </select>
        <p class="field-hint">Runs once, at first boot only - redeploying a code change means launching a new instance with an updated script, not updating this one.</p>
      </div>
      ${
        this.#deployMode === "raw"
          ? `<div class="field">
              <label>Startup script / userData (optional)</label>
              <textarea id="userData" rows="4" placeholder="#!/bin/sh&#10;echo hello"></textarea>
            </div>`
          : ""
      }
      ${
        this.#deployMode === "git"
          ? `<div class="field-row">
              <div class="field">
                <label>Git repo URL</label>
                <input id="gitRepoUrl" type="text" placeholder="https://github.com/example/app.git" />
              </div>
              <div class="field">
                <label>Branch</label>
                <input id="gitBranch" type="text" placeholder="main" value="main" />
              </div>
            </div>
            <div class="field">
              <label>Start command</label>
              <input id="gitStartCommand" type="text" placeholder="npm start" />
            </div>
            <p class="field-hint">Public repos only - no dedicated field for a private-repo token (UserData/SSM output are both plaintext-visible on the instance).</p>
            <pre id="userdata-preview" class="userdata-preview"></pre>`
          : ""
      }
      ${
        this.#deployMode === "container"
          ? `<div class="field-row">
              <div class="field">
                <label>Container image</label>
                <input id="containerImage" type="text" placeholder="nginx:latest" />
              </div>
              <div class="field">
                <label>Port</label>
                <input id="containerPort" type="number" placeholder="8080" value="8080" />
              </div>
            </div>
            <p class="field-hint">Assumes an Amazon Linux 2023 AMI (dnf-based Docker install) - use Raw script for a different base OS.</p>
            <pre id="userdata-preview" class="userdata-preview"></pre>`
          : ""
      }
      <div class="field">
        <label>IAM instance profile name (optional)</label>
        <input id="iamInstanceProfileName" type="text" placeholder="my-ssm-profile" />
        <p class="field-hint">Must already exist in your AWS account (this app never creates one) - enables the Redeploy action in Operations → Monitoring once the instance is running.</p>
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
      ${this.#launchSuccessMessage ? `<p class="success-text">✅ ${escapeHtml(this.#launchSuccessMessage)}</p>` : ""}
    `;

    const instanceTypeSelect = this.#root.querySelector<HTMLSelectElement>("#instanceType")!;
    instanceTypeSelect.addEventListener("change", () => {
      this.#root.querySelector<HTMLElement>("#cost-hint")!.textContent = formatEc2HourlyEstimate(instanceTypeSelect.value);
    });

    const deployModeSelect = this.#root.querySelector<HTMLSelectElement>("#deployMode");
    if (deployModeSelect) {
      deployModeSelect.addEventListener("change", () => {
        this.#deployMode = deployModeSelect.value as DeployMode;
        this.render();
      });
    }
    // Live preview of the generated userData for "Git repo"/"Container
    // image" mode - updates the <pre> directly rather than calling
    // render(), which would rebuild every input from scratch and drop
    // focus/cursor position mid-keystroke (the same class of bug the
    // Configure-form-wipe fix above addressed for the confirm-box
    // transition).
    const updateUserDataPreview = (): void => {
      const preview = this.#root.querySelector<HTMLElement>("#userdata-preview");
      if (!preview) {
        return;
      }
      const val = (id: string) => this.#root.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
      if (this.#deployMode === "git") {
        preview.textContent = generateGitRepoUserData({
          repoUrl: val("gitRepoUrl"),
          branch: val("gitBranch").trim() || "main",
          startCommand: val("gitStartCommand"),
        });
      } else if (this.#deployMode === "container") {
        preview.textContent = generateContainerImageUserData({ image: val("containerImage"), port: Number(val("containerPort")) || 0 });
      }
    };
    updateUserDataPreview();
    ["#gitRepoUrl", "#gitBranch", "#gitStartCommand", "#containerImage", "#containerPort"].forEach((sel) => {
      this.#root.querySelector<HTMLInputElement>(sel)?.addEventListener("input", updateUserDataPreview);
    });

    this.#root.querySelector<HTMLButtonElement>("#launch-btn")!.addEventListener("click", () => {
      // Read the Configure form NOW - render()'s own re-render below
      // (triggered by #confirmingLaunch flipping true) rebuilds every
      // input from scratch with no preserved value, so reading them
      // afterward (e.g. inside #confirm-launch-btn's own handler) would
      // silently read back empty strings instead of what was typed.
      const val = (id: string) => (this.#root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#${id}`)?.value ?? "").trim();
      const userData =
        this.#deployMode === "git"
          ? generateGitRepoUserData({ repoUrl: val("gitRepoUrl"), branch: val("gitBranch") || "main", startCommand: val("gitStartCommand") })
          : this.#deployMode === "container"
            ? generateContainerImageUserData({ image: val("containerImage"), port: Number(val("containerPort")) || 0 })
            : val("userData");
      this.#pendingLaunchConfig = {
        imageId: val("imageId"),
        instanceType: val("instanceType"),
        ...(val("keyName") ? { keyName: val("keyName") } : {}),
        ...(userData ? { userData } : {}),
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
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-ec2-provisioning")) {
  customElements.define("control-ec2-provisioning", Ec2ProvisioningControl);
}
