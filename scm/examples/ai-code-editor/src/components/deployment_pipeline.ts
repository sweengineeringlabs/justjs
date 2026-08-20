import {
  DEPLOYMENT_STEP_ORDER,
  DEPLOYMENT_STEP_LABELS,
  getDeploymentPipelines,
  getDeploymentPipeline,
  createDeploymentPipeline,
  deleteDeploymentPipeline,
  markStepSatisfied,
  canActOnStep,
} from "../core/deployment_pipeline_state.js";
import type { DeploymentStepId, DeploymentPipelineEntry } from "../core/deployment_pipeline_state.js";
import { createDeploymentPipelineProvider } from "../core/deployment_pipeline_provider.js";
import type { ProviderBackedStepId } from "../core/deployment_pipeline_provider.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const ATTESTED_STEPS = new Set<DeploymentStepId>(["build", "rollout"]);

function isProviderBacked(stepId: DeploymentStepId): stepId is ProviderBackedStepId {
  return !ATTESTED_STEPS.has(stepId);
}

// Real, interactive deployment-workflow pipeline (justjs#153's 6-stage
// model, justjs#154) - select any of the 6 steps, configure it, act on
// it, gated so a step can't be actioned until every step before it is
// satisfied. No AWS-credential gate - the 4 action-backed steps
// (Test/verify, Provision, Release, Rollback) go through a pluggable
// provider (`core/deployment_pipeline_provider.ts`), "mock" only for
// now per direct instruction - real AWS wiring is a deliberate later
// step, not this one. Build and Rollout strategy are pure manual
// attestation (a note + a checkbox the user checks themselves) - this
// app has no CI/build system and no multi-instance orchestration
// capability, so there's honestly nothing to automate for either, now
// or later.
export class DeploymentPipelineControl extends HTMLElement {
  #expandedPipelineName: string | null = null;
  #expandedStepId: DeploymentStepId | null = null;
  #actingStepId: DeploymentStepId | null = null;
  #actionError: string | null = null;
  #actionOutput: string | null = null;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    this.render();
  }

  resetView(): void {
    this.#expandedPipelineName = null;
    this.#resetStepPanel();
    this.render();
  }

  #resetStepPanel(): void {
    this.#expandedStepId = null;
    this.#actingStepId = null;
    this.#actionError = null;
    this.#actionOutput = null;
  }

  #handleCreate(pipelineName: string): void {
    if (!pipelineName.trim()) {
      return;
    }
    createDeploymentPipeline(pipelineName.trim());
    this.render();
  }

  #handleDelete(pipelineName: string): void {
    deleteDeploymentPipeline(pipelineName);
    if (this.#expandedPipelineName === pipelineName) {
      this.#expandedPipelineName = null;
      this.#resetStepPanel();
    }
    this.render();
  }

  #handleAttest(pipelineName: string, stepId: DeploymentStepId, notes: string): void {
    const entry = getDeploymentPipeline(pipelineName);
    // Real gate enforced here, not just in the render-time disabled
    // button - this must hold even against direct DOM manipulation of
    // a later step's controls, per this feature's own requirement.
    if (!entry || !canActOnStep(entry, stepId)) {
      this.#actionError = "This step isn't unlocked yet - complete the prior step first.";
      this.render();
      return;
    }
    markStepSatisfied(pipelineName, stepId, notes);
    this.#resetStepPanel();
    this.render();
  }

  async #handleAct(pipelineName: string, stepId: ProviderBackedStepId, notes: string): Promise<void> {
    const entry = getDeploymentPipeline(pipelineName);
    if (!entry || !canActOnStep(entry, stepId)) {
      this.#actionError = "This step isn't unlocked yet - complete the prior step first.";
      this.render();
      return;
    }
    this.#actingStepId = stepId;
    this.#actionError = null;
    this.#actionOutput = null;
    this.render();
    try {
      const provider = createDeploymentPipelineProvider("mock");
      const result = await provider.actOnStep(stepId, notes);
      if (result.satisfied) {
        markStepSatisfied(pipelineName, stepId, notes);
        this.#actionOutput = result.output;
      } else {
        this.#actionError = result.output;
      }
    } catch (e) {
      this.#actionError = e instanceof Error ? e.message : String(e);
    } finally {
      this.#actingStepId = null;
      this.render();
    }
  }

  private render(): void {
    const pipelines = getDeploymentPipelines();

    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .section-title { margin: 18px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .field { display: flex; flex-direction: column; gap: 4px; margin: 0 0 10px; }
        .field label { font-size: 12px; color: var(--text-muted); }
        .field input, .field textarea {
          font: inherit; font-size: 14px; padding: 8px 10px; border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border); background: var(--surface); color: var(--text);
        }
        .field textarea { resize: vertical; }
        .field-row { display: flex; gap: 10px; }
        .field-row .field { flex: 1; }
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
        .success-text { color: #1e7e34; font-size: 12px; margin: 8px 0 0; }
        .pipeline-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .pipeline-row:last-child { border-bottom: none; }
        .pipeline-name { font-weight: 600; font-size: 14px; }
        .pipeline-progress { font-size: 12px; color: var(--text-muted); }
        .pipeline-actions { display: flex; gap: 6px; }
        .steps-panel { margin: 10px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface-alt); }
        .step-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); gap: 10px; }
        .step-row:last-child { border-bottom: none; }
        .step-label { font-weight: 600; font-size: 14px; }
        .step-locked-hint { font-size: 11px; color: var(--text-muted); }
        .step-mark { font-size: 16px; }
        .step-detail { margin: 8px 0 0; padding: 10px; border-radius: var(--radius-md, 8px); background: var(--surface); }
        .confirm-check { display: flex; align-items: flex-start; gap: 8px; margin: 10px 0 0; font-size: 13px; }
      </style>
      <p class="connect-hint">Walk through a real deployment workflow - Build → Test/verify → Provision → Release → Rollout strategy → Rollback - one step at a time. A step can only be acted on once every step before it is satisfied. Test/verify, Provision, Release, and Rollback run against a mock backend for now (real AWS wiring is a separate, later step) - Build and Rollout strategy are your own manual confirmation, since this app has no real build system or multi-instance rollout capability to automate either one.</p>

      <p class="section-title">New pipeline</p>
      <div class="field-row">
        <div class="field">
          <label>Pipeline name</label>
          <input id="new-pipeline-name" type="text" placeholder="prod-api" />
        </div>
      </div>
      <button id="create-pipeline-btn" type="button" class="btn-primary">Create Pipeline</button>

      <p class="section-title">Pipelines</p>
      <div id="pipelines-list"></div>
    `;

    this.#root.querySelector<HTMLButtonElement>("#create-pipeline-btn")!.addEventListener("click", () => {
      const input = this.#root.querySelector<HTMLInputElement>("#new-pipeline-name")!;
      this.#handleCreate(input.value);
    });

    const listEl = this.#root.querySelector<HTMLElement>("#pipelines-list")!;
    if (pipelines.length === 0) {
      listEl.innerHTML = `<p class="connect-hint">No pipelines yet - create one above.</p>`;
      return;
    }

    listEl.innerHTML = pipelines
      .map((entry) => {
        const expanded = this.#expandedPipelineName === entry.pipelineName;
        return `
          <div class="pipeline-row">
            <div>
              <div class="pipeline-name">${escapeHtml(entry.pipelineName)}</div>
              <div class="pipeline-progress">${entry.satisfiedSteps.length}/${DEPLOYMENT_STEP_ORDER.length} steps satisfied</div>
            </div>
            <div class="pipeline-actions">
              <button type="button" class="btn-secondary" data-toggle="${escapeHtml(entry.pipelineName)}">${expanded ? "Hide" : "Open"}</button>
              <button type="button" class="btn-danger" data-delete="${escapeHtml(entry.pipelineName)}">Delete</button>
            </div>
          </div>
          ${expanded ? this.#renderStepsPanel(entry) : ""}
        `;
      })
      .join("");

    listEl.querySelectorAll<HTMLButtonElement>("button[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.dataset["toggle"]!;
        if (this.#expandedPipelineName === name) {
          this.#expandedPipelineName = null;
        } else {
          this.#expandedPipelineName = name;
        }
        this.#resetStepPanel();
        this.render();
      });
    });
    listEl.querySelectorAll<HTMLButtonElement>("button[data-delete]").forEach((btn) => {
      btn.addEventListener("click", () => this.#handleDelete(btn.dataset["delete"]!));
    });

    if (this.#expandedPipelineName) {
      this.#wireStepPanel(this.#expandedPipelineName);
    }
  }

  #renderStepsPanel(entry: DeploymentPipelineEntry): string {
    return `
      <div class="steps-panel">
        ${DEPLOYMENT_STEP_ORDER.map((stepId, index) => {
          const satisfied = entry.satisfiedSteps.includes(stepId);
          const unlocked = canActOnStep(entry, stepId);
          const stepOpen = this.#expandedStepId === stepId;
          const priorLabel = index > 0 ? DEPLOYMENT_STEP_LABELS[DEPLOYMENT_STEP_ORDER[index - 1]!] : null;
          return `
            <div class="step-row">
              <div>
                <span class="step-mark">${satisfied ? "✅" : "○"}</span>
                <span class="step-label">${escapeHtml(DEPLOYMENT_STEP_LABELS[stepId])}</span>
                ${!unlocked ? `<div class="step-locked-hint">Complete "${escapeHtml(priorLabel ?? "")}" first</div>` : ""}
              </div>
              <button type="button" class="btn-secondary" data-step-toggle="${stepId}" ${unlocked ? "" : "disabled"}>${stepOpen ? "Close" : satisfied ? "View" : "Configure"}</button>
            </div>
            ${stepOpen && unlocked ? this.#renderStepDetail(entry, stepId) : ""}
          `;
        }).join("")}
        ${this.#actionError ? `<p class="error-text">⚠️ ${escapeHtml(this.#actionError)}</p>` : ""}
        ${this.#actionOutput ? `<p class="success-text">✅ ${escapeHtml(this.#actionOutput)}</p>` : ""}
      </div>
    `;
  }

  #renderStepDetail(entry: DeploymentPipelineEntry, stepId: DeploymentStepId): string {
    const existingNotes = entry.stepNotes[stepId] ?? "";
    const acting = this.#actingStepId === stepId;
    if (ATTESTED_STEPS.has(stepId)) {
      return `
        <div class="step-detail">
          <div class="field">
            <label>Notes</label>
            <textarea id="step-notes-${stepId}" rows="2" placeholder="e.g. ami-0abc123, or the rollout strategy you're following">${escapeHtml(existingNotes)}</textarea>
          </div>
          <label class="confirm-check">
            <input type="checkbox" id="step-attest-${stepId}" />
            <span>I confirm this step is genuinely done.</span>
          </label>
        </div>
      `;
    }
    return `
      <div class="step-detail">
        <div class="field">
          <label>Notes</label>
          <textarea id="step-notes-${stepId}" rows="2" placeholder="What are you doing for this step?">${escapeHtml(existingNotes)}</textarea>
        </div>
        <button type="button" class="btn-primary" id="step-act-${stepId}" ${acting ? "disabled" : ""}>${acting ? "Acting…" : "Act"}</button>
      </div>
    `;
  }

  #wireStepPanel(pipelineName: string): void {
    const listEl = this.#root.querySelector<HTMLElement>("#pipelines-list")!;
    listEl.querySelectorAll<HTMLButtonElement>("button[data-step-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const stepId = btn.dataset["stepToggle"] as DeploymentStepId;
        if (this.#expandedStepId === stepId) {
          this.#resetStepPanel();
        } else {
          this.#resetStepPanel();
          this.#expandedStepId = stepId;
        }
        this.render();
      });
    });

    const stepId = this.#expandedStepId;
    if (!stepId) {
      return;
    }
    const notesEl = listEl.querySelector<HTMLTextAreaElement>(`#step-notes-${stepId}`);
    if (ATTESTED_STEPS.has(stepId)) {
      const checkbox = listEl.querySelector<HTMLInputElement>(`#step-attest-${stepId}`);
      checkbox?.addEventListener("change", () => {
        if (checkbox.checked) {
          this.#handleAttest(pipelineName, stepId, notesEl?.value ?? "");
        }
      });
    } else if (isProviderBacked(stepId)) {
      const actBtn = listEl.querySelector<HTMLButtonElement>(`#step-act-${stepId}`);
      actBtn?.addEventListener("click", () => {
        void this.#handleAct(pipelineName, stepId, notesEl?.value ?? "");
      });
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-deployment-pipeline")) {
  customElements.define("control-deployment-pipeline", DeploymentPipelineControl);
}
