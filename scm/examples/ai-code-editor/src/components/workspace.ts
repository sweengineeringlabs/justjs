import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo } from "../core/navigation.js";
import { inferLanguage, normalizePath, pathExists } from "../core/fs.js";
import { renderMarkdownToHtml } from "../core/markdown.js";

interface SdlcFunction {
  readonly label: string;
  // Present => a real, working link into one of this app's existing
  // tabs. Absent (and no `action` either) => an honestly-labeled "Coming
  // soon" stub, not a fake-functional button - this hub currently ships
  // the widget shell only, not new tooling for every stage.
  readonly route?: string;
  // Present => clicking opens an inline view within this stage's own
  // detail screen (WorkspaceElement's own drill-down), rather than
  // navigating to another tab or showing a stub. Only Design uses this
  // today - Architecture and Wireframes are two distinct entries that
  // both open the same real generateDesignDoc() capability, since one
  // generated Markdown+Mermaid doc genuinely covers what both labels
  // represent (the write-up and the diagram).
  readonly action?: "design-generate";
}

interface SdlcStage {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly functions: readonly SdlcFunction[];
}

// Development -> Editor, Testing -> Review, Ideation -> Chat, and
// Planning -> Scaffold are real links into this app's existing tabs -
// each the natural fit for that stage (scaffolding a new file/project
// IS a planning activity; an AI code review IS a testing activity;
// brainstorming with Chat IS ideation). Design's Architecture and
// Wireframes are both real (not stubs) - both open the same inline
// Markdown+Mermaid generator (renderDesignGenerator() below), since one
// generated doc covers both. Requirement/Deployment/Operations have no
// corresponding feature in this app yet.
const SDLC_STAGES: readonly SdlcStage[] = [
  { key: "ideation", label: "Ideation", icon: "💡", functions: [{ label: "Chat", route: "/chat" }] },
  { key: "requirement", label: "Requirement", icon: "📋", functions: [{ label: "Specs" }, { label: "User Stories" }] },
  { key: "planning", label: "Planning", icon: "🗺️", functions: [{ label: "Scaffold", route: "/scaffold" }] },
  {
    key: "design",
    label: "Design",
    icon: "🎨",
    functions: [
      { label: "Architecture", action: "design-generate" },
      { label: "Wireframes", action: "design-generate" },
    ],
  },
  { key: "development", label: "Development", icon: "💻", functions: [{ label: "Editor", route: "/editor" }] },
  { key: "testing", label: "Testing", icon: "🧪", functions: [{ label: "Review", route: "/review" }] },
  { key: "deployment", label: "Deployment", icon: "🚀", functions: [{ label: "Git" }, { label: "Cloud" }] },
  { key: "operations", label: "Operations", icon: "📈", functions: [{ label: "Monitoring" }, { label: "Logs" }] },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The SDLC hub: an 8-widget overview (one per stage), drilling into each
// stage's function list on tap - same widget-grid-then-drill-down
// architecture agentic-memory-demo's dashboard.ts established. Design is
// the one stage with real, inline functionality (a Markdown+Mermaid
// design-doc generator) rather than a link elsewhere or a stub.
export class WorkspaceElement extends HTMLElement {
  private store?: FeatureStore<AppState, AppAction>;
  private currentStageKey: string | null = null;

  // Design-stage local state - component-local, not global AppState,
  // matching ScaffoldElement's own generatedFileCode/generatedProjectFiles
  // pattern: nothing here is committed to the real project until an
  // explicit "Create file" tap.
  private designDescription = "";
  private designDoc: string | null = null;
  private designViewMode: "edit" | "preview" = "edit";
  private designRenderToken = 0;
  // Design has three drill-down levels (Workspace -> Design's own
  // Architecture/Wireframes list -> the shared generator), one more than
  // every other stage's two (Workspace -> function list). This flag is
  // the third level's on/off switch.
  private showDesignGenerator = false;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.store = ctx?.store;
  }

  connectedCallback(): void {
    this.innerHTML = `<div id="workspace-view"></div>`;
    this.renderView();
  }

  private renderView(): void {
    const container = this.querySelector("#workspace-view");
    if (!container) {
      return;
    }
    const stage = SDLC_STAGES.find((s) => s.key === this.currentStageKey);
    if (!stage) {
      this.renderOverview(container);
      return;
    }
    this.renderStage(container, stage);
  }

  private renderOverview(container: Element): void {
    container.innerHTML = `
      <div class="widget-grid">
        ${SDLC_STAGES.map(
          (s) => `
            <button class="widget widget-action" data-stage="${s.key}" type="button">
              <span class="widget-icon">${s.icon}</span>
              <span class="widget-label">${escapeHtml(s.label)}</span>
            </button>
          `
        ).join("")}
      </div>
    `;
    container.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.currentStageKey = btn.dataset.stage ?? null;
        // Always start a freshly-entered stage at its function list, not
        // mid-generator from a previous visit.
        this.showDesignGenerator = false;
        this.renderView();
      });
    });
  }

  private renderStage(container: Element, stage: SdlcStage): void {
    if (stage.key === "design" && this.showDesignGenerator) {
      this.renderDesignGenerator(container);
      return;
    }
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Workspace</button>
        <h2 class="workspace-stage-title">${stage.icon} ${escapeHtml(stage.label)}</h2>
      </div>
      <div class="workspace-function-list">
        ${stage.functions
          .map((f) => {
            if (f.action) {
              return `
                <button class="workspace-function workspace-function-live" data-action="${f.action}" type="button">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-arrow">→</span>
                </button>
              `;
            }
            return f.route
              ? `
                <button class="workspace-function workspace-function-live" data-route="${f.route}" type="button">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-arrow">→</span>
                </button>
              `
              : `
                <div class="workspace-function workspace-function-stub">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-badge">Coming soon</span>
                </div>
              `;
          })
          .join("")}
      </div>
    `;
    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      this.currentStageKey = null;
      this.renderView();
    });
    container.querySelectorAll<HTMLButtonElement>(".workspace-function-live[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.dataset.route;
        if (route) {
          navigateTo(route);
        }
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="design-generate"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showDesignGenerator = true;
        this.renderView();
      });
    });
  }

  // ---- Design: Markdown + Mermaid doc generator (opened from either
  // Architecture or Wireframes above) ----

  private renderDesignGenerator(container: Element): void {
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Design</button>
        <h2 class="workspace-stage-title">🎨 Generate</h2>
      </div>
      <div class="design-form">
        <label class="field">
          <span class="field-label">Describe what to design</span>
          <textarea id="design-description" rows="4" placeholder="e.g. the auth flow for this app"></textarea>
        </label>
        <button id="design-generate-btn" type="button">Generate</button>
      </div>
      <p id="design-status" class="editor-status" hidden></p>
      <div id="design-result" class="design-result" ${this.designDoc ? "" : "hidden"}>
        <div class="design-mode-toggle">
          <button id="design-mode-edit-btn" type="button" class="design-mode-btn active">Edit</button>
          <button id="design-mode-preview-btn" type="button" class="design-mode-btn">Preview</button>
        </div>
        <textarea id="design-source" class="design-source" rows="10">${this.designDoc ? escapeHtml(this.designDoc) : ""}</textarea>
        <div id="design-preview" class="design-preview" hidden></div>
        <div class="design-create-row">
          <input id="design-file-path" type="text" value="design.md" autocomplete="off" spellcheck="false" />
          <button id="design-create-btn" type="button">Create file</button>
        </div>
        <p id="design-create-error" class="attach-image-error" hidden></p>
      </div>
    `;

    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#design-description")!;
    descriptionInput.value = this.designDescription;
    descriptionInput.addEventListener("input", () => {
      this.designDescription = descriptionInput.value;
    });

    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    sourceEl?.addEventListener("input", () => {
      this.designDoc = sourceEl.value;
    });

    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      // One level back - to Design's own Architecture/Wireframes list,
      // not all the way out to the Workspace overview (that back button,
      // in the generic function-list view above, handles that level).
      this.showDesignGenerator = false;
      this.renderView();
    });
    this.querySelector("#design-generate-btn")?.addEventListener("click", () => void this.handleGenerateDesignDoc());
    this.querySelector("#design-mode-edit-btn")?.addEventListener("click", () => void this.setDesignViewMode("edit"));
    this.querySelector("#design-mode-preview-btn")?.addEventListener("click", () => void this.setDesignViewMode("preview"));
    this.querySelector("#design-create-btn")?.addEventListener("click", () => this.handleCreateDesignFile());

    this.applyDesignViewMode();
  }

  private async handleGenerateDesignDoc(): Promise<void> {
    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#design-description");
    const generateBtn = this.querySelector<HTMLButtonElement>("#design-generate-btn");
    const resultBox = this.querySelector<HTMLElement>("#design-result");
    if (!descriptionInput || !generateBtn || !resultBox) {
      return;
    }
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showDesignStatus("⚠️ Add an Anthropic API key in Settings to generate a design doc.");
      return;
    }
    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.showDesignStatus("Generating…");
    try {
      const doc = await provider.generateDesignDoc({ description });
      this.designDoc = doc;
      this.designViewMode = "edit";
      const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
      if (sourceEl) {
        sourceEl.value = doc;
      }
      resultBox.hidden = false;
      this.applyDesignViewMode();
      this.hideDesignStatus();
    } catch (e) {
      this.showDesignStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  private applyDesignViewMode(): void {
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    const previewEl = this.querySelector<HTMLElement>("#design-preview");
    const editBtn = this.querySelector<HTMLButtonElement>("#design-mode-edit-btn");
    const previewBtn = this.querySelector<HTMLButtonElement>("#design-mode-preview-btn");
    if (!sourceEl || !previewEl || !editBtn || !previewBtn) {
      return;
    }
    const isPreview = this.designViewMode === "preview";
    sourceEl.hidden = isPreview;
    previewEl.hidden = !isPreview;
    editBtn.classList.toggle("active", !isPreview);
    previewBtn.classList.toggle("active", isPreview);
  }

  private async setDesignViewMode(mode: "edit" | "preview"): Promise<void> {
    if (mode === "edit") {
      this.designViewMode = "edit";
      this.applyDesignViewMode();
      return;
    }
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    if (!sourceEl) {
      return;
    }
    this.designDoc = sourceEl.value;
    this.designViewMode = "preview";
    this.applyDesignViewMode();
    const previewEl = this.querySelector<HTMLElement>("#design-preview");
    if (previewEl) {
      previewEl.innerHTML = `<p class="editor-status">Rendering…</p>`;
    }
    // The user may switch back to Edit, or even navigate away and
    // regenerate an entirely new doc, while this async render (real
    // Mermaid rendering can take real time) is still in flight - a
    // token guard, not just a designViewMode check, since navigating
    // away and back could coincidentally leave designViewMode as
    // "preview" again by the time this resolves, for a DIFFERENT doc.
    const token = ++this.designRenderToken;
    const html = await renderMarkdownToHtml(this.designDoc ?? "");
    if (token !== this.designRenderToken) {
      return;
    }
    const currentPreviewEl = this.querySelector<HTMLElement>("#design-preview");
    if (this.designViewMode === "preview" && currentPreviewEl) {
      currentPreviewEl.innerHTML = html;
    }
  }

  private handleCreateDesignFile(): void {
    if (!this.store) {
      return;
    }
    const pathInput = this.querySelector<HTMLInputElement>("#design-file-path");
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    const errorEl = this.querySelector<HTMLElement>("#design-create-error");
    if (!pathInput || !sourceEl || !errorEl) {
      return;
    }
    const path = normalizePath(pathInput.value);
    if (!path) {
      errorEl.hidden = false;
      errorEl.textContent = "Enter a path before creating the file.";
      return;
    }
    const state = this.store.state.value;
    if (pathExists(state.files, state.emptyFolders, path)) {
      errorEl.hidden = false;
      errorEl.textContent = `"${path}" already exists - choose a different path.`;
      return;
    }
    errorEl.hidden = true;
    this.store.dispatch({ type: "CREATE_FILE", path, content: sourceEl.value, language: inferLanguage(path) });
    navigateTo("/editor");
  }

  private showDesignStatus(text: string): void {
    const el = this.querySelector<HTMLElement>("#design-status");
    if (!el) {
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  private hideDesignStatus(): void {
    const el = this.querySelector<HTMLElement>("#design-status");
    if (el) {
      el.hidden = true;
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-workspace")) {
  customElements.define("x-workspace", WorkspaceElement);
}
