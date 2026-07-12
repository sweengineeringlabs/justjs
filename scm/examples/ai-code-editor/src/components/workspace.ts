import { navigateTo } from "../core/navigation.js";

interface SdlcFunction {
  readonly label: string;
  // Present => a real, working link into one of this app's existing
  // tabs. Absent => an honestly-labeled "Coming soon" stub, not a
  // fake-functional button - this hub currently ships the widget shell
  // only, not new tooling for every stage.
  readonly route?: string;
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
// brainstorming with Chat IS ideation). Requirement/Design/Deployment/
// Operations have no corresponding feature in this app yet.
const SDLC_STAGES: readonly SdlcStage[] = [
  { key: "ideation", label: "Ideation", icon: "💡", functions: [{ label: "Chat", route: "/chat" }] },
  { key: "requirement", label: "Requirement", icon: "📋", functions: [{ label: "Specs" }, { label: "User Stories" }] },
  { key: "planning", label: "Planning", icon: "🗺️", functions: [{ label: "Scaffold", route: "/scaffold" }] },
  { key: "design", label: "Design", icon: "🎨", functions: [{ label: "Architecture" }, { label: "Wireframes" }] },
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
// architecture agentic-memory-demo's dashboard.ts established. No
// FeatureStore dependency yet (nothing here is derived from AppState) -
// added if/when a stage widget needs to reflect real app state.
export class WorkspaceElement extends HTMLElement {
  private currentStageKey: string | null = null;

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
        this.renderView();
      });
    });
  }

  private renderStage(container: Element, stage: SdlcStage): void {
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Workspace</button>
        <h2 class="workspace-stage-title">${stage.icon} ${escapeHtml(stage.label)}</h2>
      </div>
      <div class="workspace-function-list">
        ${stage.functions
          .map((f) =>
            f.route
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
              `
          )
          .join("")}
      </div>
    `;
    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      this.currentStageKey = null;
      this.renderView();
    });
    container.querySelectorAll<HTMLButtonElement>(".workspace-function-live").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.dataset.route;
        if (route) {
          navigateTo(route);
        }
      });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-workspace")) {
  customElements.define("x-workspace", WorkspaceElement);
}
