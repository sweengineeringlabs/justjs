import type { FeatureStore } from "@justjs/data";
import type { MemoryRecord } from "@justjs/memory";
import type { AppState, AppAction } from "../core/state.js";
import { memoryProvider } from "../core/memory.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderRecordList(records: MemoryRecord[]): string {
  if (records.length === 0) {
    return "<p>(none)</p>";
  }
  return `<ul>${records
    .map(
      (r) =>
        `<li data-id="${r.id}"><span class="memory-kind">${r.kind}</span> ` +
        `<span class="memory-content">${escapeHtml(r.content)}</span> ` +
        `<span class="memory-tags">${(r.tags ?? []).join(", ")}</span></li>`
    )
    .join("")}</ul>`;
}

// The "autonomous mode... visible, inspectable" surface. Trigger-on-demand
// only for v1, not a background timer - one button click both mutates
// storage (via consolidate()) and renders a full diff/log of what
// happened and why, since ConsolidationResult carries the complete
// created/deleted records, not just ids, specifically so this view never
// needs to re-query already-deleted data to show what was removed.
export class CurationElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderResult();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <button id="curation-run-btn">run agent curation</button>
      <div id="curation-output"></div>
    `;
    this.querySelector("#curation-run-btn")?.addEventListener("click", () => void this.runCuration());
    this.renderResult();
  }

  private async runCuration(): Promise<void> {
    if (!this.store) {
      return;
    }
    const userId = this.store.state.value.userId;
    const result = await memoryProvider.consolidate(userId);
    this.store.dispatch({ type: "CURATION_SET_RESULT", result });
  }

  private renderResult(): void {
    const output = this.querySelector("#curation-output");
    if (!output || !this.store) {
      return;
    }
    const result = this.store.state.value.curationResult;
    if (!result) {
      output.innerHTML = `<p id="curation-empty-state">No curation has been run yet.</p>`;
      return;
    }
    output.innerHTML = `
      <ol id="curation-log">${result.reasoning.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol>
      <h3>Created</h3>
      <div id="curation-created">${renderRecordList(result.createdRecords)}</div>
      <h3>Deleted</h3>
      <div id="curation-deleted">${renderRecordList(result.deletedRecords)}</div>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-curation")) {
  customElements.define("x-curation", CurationElement);
}
