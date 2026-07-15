import { escapeHtml, escapeAttr } from "./escape.js";
import type { ListItem } from "../api/list_view.js";

// Real Shadow DOM port of the resource-list step at the end of every
// provider-connect screen (ADR-0016) - name+status rows, an empty-state
// message when there are none, optionally clickable (communication.ts's
// channel/message drill-down). Checked directly: no <table> element
// exists anywhere in ai-code-editor - this closes the "is this a
// table?" question with no, a plain 2-piece-per-row list. Doesn't fetch
// or own loading/error state - only renders whatever `items` it's
// given and relays a click as an event, same "props in, event out"
// shape as <view-grid>. No standalone migration target - only proves
// itself real once composed into <control-provider-connector>.
export class ListView extends HTMLElement {
  #items: readonly ListItem[] = [];
  #emptyMessage = "Connected - no results found.";
  #clickable = false;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get items(): readonly ListItem[] {
    return this.#items;
  }
  set items(value: readonly ListItem[]) {
    this.#items = value;
    this.render();
  }

  get emptyMessage(): string {
    return this.#emptyMessage;
  }
  set emptyMessage(value: string) {
    this.#emptyMessage = value;
    this.render();
  }

  get clickable(): boolean {
    return this.#clickable;
  }
  set clickable(value: boolean) {
    this.#clickable = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  #renderRow(item: ListItem): string {
    const inner = `
      <span class="resource-name">${escapeHtml(item.name)}</span>
      <span class="resource-status">${escapeHtml(item.status)}</span>
    `;
    return this.#clickable
      ? `<li class="resource-row"><button type="button" class="resource-open-btn" data-id="${escapeAttr(item.id)}">${inner}</button></li>`
      : `<li class="resource-row">${inner}</li>`;
  }

  private render(): void {
    const body =
      this.#items.length === 0
        ? `<p class="empty">${escapeHtml(this.#emptyMessage)}</p>`
        : `<ul class="resource-list">${this.#items.map((item) => this.#renderRow(item)).join("")}</ul>`;
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .empty {
          margin: 0;
          font-size: 12px;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .resource-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .resource-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 14px;
          background: var(--surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow);
        }
        .resource-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .resource-status {
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 3px 9px;
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--stage-color, var(--accent)) 18%, transparent);
          color: var(--stage-color, var(--accent-strong));
        }
        .resource-open-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          color: inherit;
          cursor: pointer;
          text-align: left;
        }
      </style>
      ${body}
    `;
    this.#root.querySelectorAll<HTMLButtonElement>(".resource-open-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id ?? "";
        this.dispatchEvent(new CustomEvent("item-select", { detail: { id }, bubbles: true, composed: true }));
      });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-list")) {
  customElements.define("view-list", ListView);
}
