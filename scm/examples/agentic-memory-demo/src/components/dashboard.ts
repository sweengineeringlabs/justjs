import type { FeatureStore } from "@justjs/data";
import { computeFakeEmbedding } from "@justjs/memory";
import type { MemoryKind, MemoryQuery } from "@justjs/memory";
import type { AppState, AppAction } from "../core/state.js";
import { memoryProvider } from "../core/memory.js";

const KINDS: MemoryKind[] = ["episodic", "structured", "semantic"];

type DashboardView = "overview" | "search" | "add" | "browse" | "analytics";

const SUBNAV_ITEMS: ReadonlyArray<{ view: DashboardView; icon: string; label: string }> = [
  { view: "search", icon: "🔍", label: "Search" },
  { view: "add", icon: "➕", label: "Add" },
  { view: "browse", icon: "📋", label: "Browse" },
  { view: "analytics", icon: "📊", label: "Analytics" },
];

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
// Restructured from one long scrollable screen (search form + add form
// + results, all visible at once) into a widget-grid overview that
// drills into a focused view per concern - the flat layout read as
// cluttered with real data on it (many fields with no hierarchy, no
// sense of "how much is here" at a glance). Each drill-down view keeps
// the static-skeleton-plus-targeted-update pattern chat.ts also uses
// for its own reason: an unrelated dispatch from another tab sharing
// this store shouldn't wipe whatever the user is mid-typing here - but
// switching views is itself a full, deliberate re-render (not an
// incidental store update), so setView() rebuilding #dashboard-view's
// innerHTML on every navigation is fine.
export class DashboardElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;
  private editingIds = new Set<string>();
  private view: DashboardView = "overview";

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    // Only "search"/"browse" render anything derived from
    // dashboardRecords - an unrelated dispatch (e.g. Chat writing a new
    // memory) while on "overview"/"add"/"analytics" has nothing there
    // to refresh, and re-rendering those views anyway would wipe
    // mid-typed add-form input for no reason.
    const onStoreChange = () => {
      if (this.view === "search" || this.view === "browse") {
        this.renderResultsList();
      }
    };
    this.unsubscribe = this.store?.subscribe(onStoreChange);
    this.renderView();
  }

  connectedCallback(): void {
    this.innerHTML = `<div id="dashboard-view"></div>`;
    this.renderView();
  }

  // Called by app.ts's showRoute() every time this tab becomes active
  // (see its own comment for why) - re-renders whatever view is
  // current, so overview/analytics counts and browse/search results
  // can't go stale just because the user was on another tab for a
  // while.
  notifyActivated(): void {
    this.renderView();
  }

  private setView(view: DashboardView): void {
    this.view = view;
    this.renderView();
  }

  private renderView(): void {
    const container = this.querySelector("#dashboard-view");
    if (!container || !this.store) {
      return;
    }
    switch (this.view) {
      case "overview":
        void this.renderOverview(container);
        return;
      case "search":
        this.renderSearchView(container);
        return;
      case "add":
        this.renderAddView(container);
        return;
      case "browse":
        void this.renderBrowseView(container);
        return;
      case "analytics":
        void this.renderAnalyticsView(container);
        return;
    }
  }

  private subnavHtml(active: DashboardView): string {
    return `
      <div class="dash-subnav">
        <button id="dashboard-back-btn" class="dash-back-btn" type="button">← Overview</button>
        <div class="dash-subnav-tabs">
          ${SUBNAV_ITEMS.map(
            (i) =>
              `<button class="dash-subnav-btn${i.view === active ? " active" : ""}" data-view="${i.view}" type="button">${i.icon} ${i.label}</button>`
          ).join("")}
        </div>
      </div>
    `;
  }

  private bindSubnav(): void {
    this.querySelector("#dashboard-back-btn")?.addEventListener("click", () => this.setView("overview"));
    this.querySelectorAll<HTMLButtonElement>(".dash-subnav-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.setView(btn.dataset.view as DashboardView));
    });
  }

  private async renderOverview(container: Element): Promise<void> {
    const userId = this.store!.state.value.userId;
    const all = await memoryProvider.list(userId);
    const byKind: Record<MemoryKind, number> = { episodic: 0, structured: 0, semantic: 0 };
    for (const r of all) {
      byKind[r.kind] += 1;
    }
    const maxKind = Math.max(1, ...KINDS.map((k) => byKind[k]));

    container.innerHTML = `
      <div class="widget-grid">
        <button class="widget widget-stat" id="widget-total" type="button">
          <span class="widget-icon">🗂️</span>
          <span class="widget-value" id="widget-total-value">${all.length}</span>
          <span class="widget-label">Total memories</span>
        </button>
        <button class="widget widget-bars" id="widget-kind" type="button">
          <span class="widget-icon">📊</span>
          <div class="widget-bar-list">
            ${KINDS.map(
              (k) => `
              <div class="widget-bar-row">
                <span class="widget-bar-label">${k}</span>
                <div class="widget-bar-track"><div class="widget-bar-fill widget-bar-${k}" style="width:${(byKind[k] / maxKind) * 100}%"></div></div>
                <span class="widget-bar-count">${byKind[k]}</span>
              </div>
            `
            ).join("")}
          </div>
          <span class="widget-label">By kind</span>
        </button>
        <button class="widget widget-action" id="widget-search" type="button">
          <span class="widget-icon">🔍</span>
          <span class="widget-label">Search &amp; filter</span>
        </button>
        <button class="widget widget-action" id="widget-add" type="button">
          <span class="widget-icon">➕</span>
          <span class="widget-label">Add a memory</span>
        </button>
      </div>
    `;
    this.querySelector("#widget-total")?.addEventListener("click", () => this.setView("browse"));
    this.querySelector("#widget-kind")?.addEventListener("click", () => this.setView("analytics"));
    this.querySelector("#widget-search")?.addEventListener("click", () => this.setView("search"));
    this.querySelector("#widget-add")?.addEventListener("click", () => this.setView("add"));
  }

  private renderSearchView(container: Element): void {
    container.innerHTML = `
      ${this.subnavHtml("search")}
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
      <section class="db-section db-results-section">
        <h2 class="db-section-title" id="dashboard-results-title">Results</h2>
        <div id="dashboard-results"></div>
      </section>
    `;
    this.bindSubnav();
    this.querySelector("#dashboard-search-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.runSearch();
    });
    void this.runSearch();
  }

  private renderAddView(container: Element): void {
    container.innerHTML = `
      ${this.subnavHtml("add")}
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
        <p id="dashboard-add-confirm" class="db-add-confirm" hidden>Added ✓</p>
      </section>
    `;
    this.bindSubnav();
    this.querySelector("#dashboard-add-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.addRecord();
    });
  }

  private async renderBrowseView(container: Element): Promise<void> {
    container.innerHTML = `
      ${this.subnavHtml("browse")}
      <section class="db-section db-results-section">
        <h2 class="db-section-title" id="dashboard-results-title">All memories</h2>
        <div id="dashboard-results"></div>
      </section>
    `;
    this.bindSubnav();
    const userId = this.store!.state.value.userId;
    const results = await memoryProvider.query({ userId });
    this.store!.dispatch({ type: "DASHBOARD_SET_RESULTS", results });
  }

  private async renderAnalyticsView(container: Element): Promise<void> {
    const userId = this.store!.state.value.userId;
    const all = await memoryProvider.list(userId);

    const byKind: Record<MemoryKind, number> = { episodic: 0, structured: 0, semantic: 0 };
    const bySource: Record<"user" | "agent", number> = { user: 0, agent: 0 };
    const tagCounts = new Map<string, number>();
    for (const r of all) {
      byKind[r.kind] += 1;
      bySource[r.source] += 1;
      for (const tag of r.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
    const maxKind = Math.max(1, ...KINDS.map((k) => byKind[k]));
    const maxSource = Math.max(1, bySource.user, bySource.agent);
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    container.innerHTML = `
      ${this.subnavHtml("analytics")}
      <section class="db-section">
        <h2 class="db-section-title"><span class="db-section-icon">📊</span>By kind</h2>
        <div class="db-card analytics-bars" id="analytics-kind">
          ${KINDS.map(
            (k) => `
            <div class="widget-bar-row">
              <span class="widget-bar-label">${k}</span>
              <div class="widget-bar-track"><div class="widget-bar-fill widget-bar-${k}" style="width:${(byKind[k] / maxKind) * 100}%"></div></div>
              <span class="widget-bar-count">${byKind[k]}</span>
            </div>
          `
          ).join("")}
        </div>
      </section>
      <section class="db-section">
        <h2 class="db-section-title"><span class="db-section-icon">🙋</span>By source</h2>
        <div class="db-card analytics-bars" id="analytics-source">
          ${(["user", "agent"] as const)
            .map(
              (s) => `
            <div class="widget-bar-row">
              <span class="widget-bar-label">${s === "user" ? "you" : "agent"}</span>
              <div class="widget-bar-track"><div class="widget-bar-fill widget-bar-source-${s}" style="width:${(bySource[s] / maxSource) * 100}%"></div></div>
              <span class="widget-bar-count">${bySource[s]}</span>
            </div>
          `
            )
            .join("")}
        </div>
      </section>
      <section class="db-section">
        <h2 class="db-section-title"><span class="db-section-icon">🏷️</span>Top tags</h2>
        <div class="db-card" id="analytics-top-tags">
          ${
            topTags.length > 0
              ? `<div class="memory-tags">${topTags.map(([tag, count]) => `<span class="tag-pill">${escapeHtml(tag)} · ${count}</span>`).join("")}</div>`
              : `<p class="db-empty-hint">No tags yet - tags are added via the Add view.</p>`
          }
        </div>
      </section>
    `;
    this.bindSubnav();
  }

  private currentFilterQuery(): MemoryQuery {
    const userId = this.store!.state.value.userId;
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
    return query;
  }

  private async runSearch(): Promise<void> {
    if (!this.store) {
      return;
    }
    const results = await memoryProvider.query(this.currentFilterQuery());
    this.store.dispatch({ type: "DASHBOARD_SET_RESULTS", results });
  }

  private async refreshCurrentResults(): Promise<void> {
    if (this.view === "search") {
      await this.runSearch();
    } else if (this.view === "browse") {
      const userId = this.store!.state.value.userId;
      const results = await memoryProvider.query({ userId });
      this.store!.dispatch({ type: "DASHBOARD_SET_RESULTS", results });
    }
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
    const confirm = this.querySelector<HTMLElement>("#dashboard-add-confirm");
    if (confirm) {
      confirm.hidden = false;
    }
  }

  private renderResultsList(): void {
    const container = this.querySelector("#dashboard-results");
    const title = this.querySelector("#dashboard-results-title");
    if (!container || !this.store) {
      return;
    }
    const results = this.store.state.value.dashboardRecords;
    if (title) {
      title.textContent = this.view === "browse" ? `All memories (${results.length})` : `Results (${results.length})`;
    }

    if (results.length === 0) {
      container.innerHTML = `
        <div class="db-empty-state">
          <div class="db-empty-icon">🗂️</div>
          <p>No memories match yet.</p>
          <p class="db-empty-hint">Try clearing filters, or add one from the Add tab.</p>
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
        this.renderResultsList();
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
    await this.refreshCurrentResults();
  }

  private async deleteRecord(id: string): Promise<void> {
    if (!this.store) {
      return;
    }
    await memoryProvider.delete(this.store.state.value.userId, id);
    await this.refreshCurrentResults();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-dashboard")) {
  customElements.define("x-dashboard", DashboardElement);
}
