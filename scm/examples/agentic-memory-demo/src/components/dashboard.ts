import type { FeatureStore } from "@justjs/data";
import { computeFakeEmbedding } from "@justjs/memory";
import type { MemoryKind, MemoryQuery } from "@justjs/memory";
import type { AppState, AppAction } from "../core/state.js";
import { memoryProvider } from "../core/memory.js";

const KINDS: MemoryKind[] = ["episodic", "structured", "semantic"];

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The "human inspects and edits stored memories" surface - the only
// place in the app tagged episodic records get created (via
// #dashboard-add-form). Chat-authored memories are always untagged
// (see chat.ts), which is what makes the curation view's tag-count
// consolidation heuristic and untagged-age forgetting heuristic each
// demoable from a distinct, intentional action instead of colliding on
// the same data.
//
// Same static-skeleton-plus-targeted-update pattern as chat.ts, for the
// same reason: filter/add-form inputs must survive a re-render triggered
// by an unrelated dispatch from another view sharing this store.
export class DashboardElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;
  private editingIds = new Set<string>();

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderResults();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <section class="db-section">
        <h2 class="db-section-title"><span class="db-section-icon">🔍</span>Search &amp; filter</h2>
        <form id="dashboard-search-form" class="db-card">
          <div class="db-field-row">
            <div class="field">
              <label class="field-label" for="dashboard-filter-kind">Kind</label>
              <select id="dashboard-filter-kind">
                <option value="any">Any kind</option>
                ${KINDS.map((k) => `<option value="${k}">${k}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="dashboard-filter-tags">Tags</label>
              <input id="dashboard-filter-tags" type="text" placeholder="e.g. diet, work" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="dashboard-filter-text">Search text</label>
            <input id="dashboard-filter-text" type="text" placeholder="What are you looking for?" autocomplete="off" />
          </div>
          <div class="db-field-row db-field-row-end">
            <label class="semantic-toggle">
              <input id="dashboard-filter-semantic" type="checkbox" />
              <span>Semantic match</span>
            </label>
            <button id="dashboard-search-btn" type="submit">Search</button>
          </div>
        </form>
      </section>

      <section class="db-section">
        <h2 class="db-section-title"><span class="db-section-icon">➕</span>Add a memory</h2>
        <form id="dashboard-add-form" class="db-card">
          <div class="db-field-row">
            <div class="field">
              <label class="field-label" for="dashboard-add-kind">Kind</label>
              <select id="dashboard-add-kind">
                ${KINDS.map((k) => `<option value="${k}">${k}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label class="field-label" for="dashboard-add-tags">Tags</label>
              <input id="dashboard-add-tags" type="text" placeholder="e.g. diet, work" autocomplete="off" />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="dashboard-add-content">Content</label>
            <input id="dashboard-add-content" type="text" placeholder="What do you want to remember?" autocomplete="off" />
          </div>
          <button id="dashboard-add-submit" type="submit">Add memory</button>
        </form>
      </section>

      <section class="db-section db-results-section">
        <h2 class="db-section-title" id="dashboard-results-title">Results</h2>
        <div id="dashboard-results"></div>
      </section>
    `;

    this.querySelector("#dashboard-search-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.runSearch();
    });
    this.querySelector("#dashboard-add-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.addRecord();
    });

    void this.runSearch();
  }

  private async runSearch(): Promise<void> {
    if (!this.store) {
      return;
    }
    const userId = this.store.state.value.userId;
    const kind = this.querySelector<HTMLSelectElement>("#dashboard-filter-kind")?.value ?? "any";
    const tags = parseTags(this.querySelector<HTMLInputElement>("#dashboard-filter-tags")?.value ?? "");
    const text = this.querySelector<HTMLInputElement>("#dashboard-filter-text")?.value.trim() ?? "";
    const semantic = this.querySelector<HTMLInputElement>("#dashboard-filter-semantic")?.checked ?? false;

    const query: MemoryQuery = { userId };
    if (kind !== "any") {
      query.kind = kind as MemoryKind;
    }
    if (tags.length > 0) {
      query.tags = tags;
    }
    if (text) {
      if (semantic) {
        query.embedding = computeFakeEmbedding(text);
        query.minScore = 0;
      } else {
        query.text = text;
      }
    }

    const results = await memoryProvider.query(query);
    this.store.dispatch({ type: "DASHBOARD_SET_RESULTS", results });
  }

  private async addRecord(): Promise<void> {
    if (!this.store) {
      return;
    }
    const userId = this.store.state.value.userId;
    const kind = this.querySelector<HTMLSelectElement>("#dashboard-add-kind")!.value as MemoryKind;
    const tags = parseTags(this.querySelector<HTMLInputElement>("#dashboard-add-tags")!.value);
    const contentInput = this.querySelector<HTMLInputElement>("#dashboard-add-content")!;
    const content = contentInput.value.trim();
    if (!content) {
      return;
    }

    await memoryProvider.write({
      userId,
      kind,
      content,
      ...(tags.length > 0 ? { tags } : {}),
      source: "user",
    });

    contentInput.value = "";
    this.querySelector<HTMLInputElement>("#dashboard-add-tags")!.value = "";
    await this.runSearch();
  }

  private renderResults(): void {
    const container = this.querySelector("#dashboard-results");
    const title = this.querySelector("#dashboard-results-title");
    if (!container || !this.store) {
      return;
    }
    const results = this.store.state.value.dashboardRecords;
    if (title) {
      title.textContent = `Results (${results.length})`;
    }

    if (results.length === 0) {
      container.innerHTML = `
        <div class="db-empty-state">
          <div class="db-empty-icon">🗂️</div>
          <p>No memories match yet.</p>
          <p class="db-empty-hint">Try clearing filters, or add one below.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = results
      .map((r) => {
        const record = r.record;
        if (this.editingIds.has(record.id)) {
          return `
            <div class="memory-row memory-row-editing" data-id="${record.id}">
              <div class="field">
                <label class="field-label" for="edit-content-${record.id}">Content</label>
                <input id="edit-content-${record.id}" type="text" value="${escapeHtml(record.content)}" />
              </div>
              <div class="field">
                <label class="field-label" for="edit-tags-${record.id}">Tags</label>
                <input id="edit-tags-${record.id}" type="text" value="${(record.tags ?? []).join(", ")}" />
              </div>
              <button class="memory-save" data-id="${record.id}" id="edit-save-${record.id}">Save</button>
            </div>
          `;
        }
        const tags = record.tags ?? [];
        return `
          <div class="memory-row" data-id="${record.id}">
            <div class="memory-row-top">
              <span class="memory-kind memory-kind-${record.kind}">${record.kind}</span>
              ${r.score !== undefined ? `<span class="memory-score-wrap"><span class="memory-score-label">match</span><span class="memory-score">${r.score.toFixed(2)}</span></span>` : ""}
            </div>
            <p class="memory-content">${escapeHtml(record.content)}</p>
            ${tags.length > 0 ? `<div class="memory-tags">${tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
            <div class="memory-row-bottom">
              <span class="memory-source">${record.source === "agent" ? "🤖 agent" : "🙋 you"}</span>
              <span class="memory-updated">${new Date(record.updatedAt).toLocaleString()}</span>
              <div class="memory-actions">
                <button class="memory-edit" data-id="${record.id}">Edit</button>
                <button class="memory-delete" data-id="${record.id}">Delete</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll<HTMLButtonElement>(".memory-edit").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.editingIds.add(btn.dataset.id!);
        this.renderResults();
      });
    });
    container.querySelectorAll<HTMLButtonElement>(".memory-save").forEach((btn) => {
      btn.addEventListener("click", () => void this.saveEdit(btn.dataset.id!));
    });
    container.querySelectorAll<HTMLButtonElement>(".memory-delete").forEach((btn) => {
      btn.addEventListener("click", () => void this.deleteRecord(btn.dataset.id!));
    });
  }

  private async saveEdit(id: string): Promise<void> {
    if (!this.store) {
      return;
    }
    const userId = this.store.state.value.userId;
    const existing = this.store.state.value.dashboardRecords.find((r) => r.record.id === id)?.record;
    if (!existing) {
      return;
    }
    const content = this.querySelector<HTMLInputElement>(`#edit-content-${id}`)!.value.trim();
    const tags = parseTags(this.querySelector<HTMLInputElement>(`#edit-tags-${id}`)!.value);

    await memoryProvider.write({
      id,
      userId,
      kind: existing.kind,
      content,
      ...(tags.length > 0 ? { tags } : {}),
      source: existing.source,
    });

    this.editingIds.delete(id);
    await this.runSearch();
  }

  private async deleteRecord(id: string): Promise<void> {
    if (!this.store) {
      return;
    }
    await memoryProvider.delete(this.store.state.value.userId, id);
    await this.runSearch();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-dashboard")) {
  customElements.define("x-dashboard", DashboardElement);
}
