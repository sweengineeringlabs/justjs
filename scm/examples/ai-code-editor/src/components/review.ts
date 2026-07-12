import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo, jumpToLine } from "../core/navigation.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Shows the last review() result, and can also trigger a fresh one
// directly (the editor's own "🔍 Review" toolbar button is the other
// entry point - both dispatch the same SET_REVIEW_FINDINGS action, so
// either path leaves this view in sync). Findings with a line number are
// clickable - jumping back to Editor and scrolling/selecting that line.
export class ReviewElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderFindings();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div class="review-toolbar">
        <button id="review-run-btn" type="button">🔍 Run review</button>
      </div>
      <p id="review-reviewed-label" class="review-reviewed-label" hidden></p>
      <p id="review-status" class="editor-status" hidden></p>
      <div id="review-findings"></div>
    `;
    this.querySelector("#review-run-btn")?.addEventListener("click", () => void this.handleRun());
    this.renderFindings();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private async handleRun(): Promise<void> {
    const runBtn = this.querySelector<HTMLButtonElement>("#review-run-btn");
    if (!runBtn || !this.store) {
      return;
    }
    const state = this.store.state.value;
    const activeFilePath = state.activeFilePath;
    const activeFile = activeFilePath ? state.files[activeFilePath] : undefined;
    if (!activeFilePath || !activeFile) {
      this.showStatus("Open a file in the Editor tab first.");
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showStatus("⚠️ Add an Anthropic API key in Settings to run a review.");
      return;
    }
    runBtn.disabled = true;
    this.showStatus("Reviewing…");
    try {
      const findings = await provider.review({ code: activeFile.content, language: activeFile.language });
      this.store.dispatch({ type: "SET_REVIEW_FINDINGS", findings, reviewedFilePath: activeFilePath });
      this.hideStatus();
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      runBtn.disabled = false;
    }
  }

  private renderFindings(): void {
    const container = this.querySelector("#review-findings");
    const label = this.querySelector<HTMLElement>("#review-reviewed-label");
    if (!container || !label) {
      return;
    }
    const state = this.store?.state.value;
    const findings = state?.reviewFindings ?? [];
    const reviewedFilePath = state?.reviewedFilePath ?? null;

    label.textContent = reviewedFilePath ? `Reviewing: ${reviewedFilePath}` : "";
    label.hidden = !reviewedFilePath;

    if (findings.length === 0) {
      container.innerHTML = `
        <div class="review-empty-state">
          <p>No review yet.</p>
          <p class="db-empty-hint">Tap "Run review" or use the editor's review button.</p>
        </div>
      `;
      return;
    }
    container.innerHTML = findings
      .map((f, i) => {
        const hasLine = f.line !== undefined;
        return `
          <button class="review-finding review-finding-${f.severity}" type="button" data-index="${i}" ${hasLine ? "" : "disabled"}>
            <span class="review-finding-badge">${f.severity}</span>
            <span class="review-finding-message">${escapeHtml(f.message)}</span>
            ${hasLine ? `<span class="review-finding-line">line ${f.line}</span>` : ""}
          </button>
        `;
      })
      .join("");
    container.querySelectorAll<HTMLButtonElement>(".review-finding").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.dataset.index);
        const finding = findings[index];
        if (finding?.line === undefined) {
          return;
        }
        navigateTo("/editor");
        jumpToLine(finding.line, reviewedFilePath ?? undefined);
      });
    });
  }

  private showStatus(text: string): void {
    const status = this.querySelector<HTMLElement>("#review-status");
    if (!status) {
      return;
    }
    status.hidden = false;
    status.textContent = text;
  }

  private hideStatus(): void {
    const status = this.querySelector<HTMLElement>("#review-status");
    if (!status) {
      return;
    }
    status.hidden = true;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-review")) {
  customElements.define("x-review", ReviewElement);
}
