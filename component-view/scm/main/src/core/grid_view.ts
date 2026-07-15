import { escapeHtml, escapeAttr } from "./escape.js";
import "./badge_view.js";
import type { BadgeView } from "./badge_view.js";
import type { GridItem } from "../api/grid_view.js";

// Real Shadow DOM port of the tile-grid shape independently arrived at
// by two real consumers: WorkspaceElement's SDLC hub (.widget-grid/
// .widget/.widget-action/.widget-icon/.widget-label, plain-icon tiles)
// and <control-provider-connector>'s provider-grid (.provider-grid/
// .provider-card, badge tiles with a `selected` state) - ADR-0014,
// superseding ADR-0013's "no grid needed" call once the comparison was
// made at the shape level instead of the current-file level. Checked
// whether `selected` is state the grid itself needs to remember: no,
// it's always data the host already computes (`connected` in the
// provider-grid case) - so this is a fully controlled view, same
// "props in, event out" shape as <view-toggle>. Composes <view-badge>
// internally when badgeColor is present.
export class GridView extends HTMLElement {
  #items: readonly GridItem[] = [];
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get items(): readonly GridItem[] {
    return this.#items;
  }
  set items(value: readonly GridItem[]) {
    this.#items = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .tile {
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 8px;
          padding: 16px;
          font-family: inherit;
          cursor: pointer;
          min-height: 92px;
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow);
          background: linear-gradient(135deg, color-mix(in srgb, var(--stage-color, var(--accent)) 20%, var(--surface)) 0%, var(--surface) 70%);
          border: 1px solid color-mix(in srgb, var(--stage-color, var(--accent)) 25%, var(--border));
        }
        .tile::before {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 34px;
          height: 34px;
          background: var(--stage-color, var(--accent));
          clip-path: polygon(100% 0, 100% 100%, 0 0);
          opacity: 0.4;
        }
        .tile.selected {
          border-color: var(--accent-strong, var(--accent));
          background: color-mix(in srgb, var(--accent) 14%, var(--surface));
        }
        .tile:active { transform: scale(0.97); }
        .tile:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .tile-icon {
          font-size: 20px;
          width: 40px;
          height: 40px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-md);
          background: color-mix(in srgb, var(--stage-color, var(--accent)) 35%, transparent);
        }
        .tile-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .tile-status {
          font-size: 11px;
          color: var(--text-muted);
        }
      </style>
      <div class="grid">
        ${this.#items
          .map((item) => {
            const styleAttr = item.accentColor ? ` style="--stage-color: ${escapeAttr(item.accentColor)}"` : "";
            const glyph =
              item.badgeColor !== undefined
                ? `<view-badge data-badge-for="${escapeAttr(item.id)}"></view-badge>`
                : `<span class="tile-icon">${escapeHtml(item.icon ?? "")}</span>`;
            const status = item.status !== undefined ? `<span class="tile-status">${escapeHtml(item.status)}</span>` : "";
            return `
              <button type="button" class="tile${item.selected ? " selected" : ""}" data-id="${escapeAttr(item.id)}"${styleAttr}>
                ${glyph}
                <span class="tile-label">${escapeHtml(item.label)}</span>
                ${status}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
    this.#root.querySelectorAll<HTMLElement>(".tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        const id = tile.dataset.id ?? "";
        this.dispatchEvent(new CustomEvent("item-select", { detail: { id }, bubbles: true, composed: true }));
      });
    });
    this.#root.querySelectorAll<Element>("view-badge[data-badge-for]").forEach((badgeEl) => {
      const id = (badgeEl as HTMLElement).dataset.badgeFor;
      const item = this.#items.find((i) => i.id === id);
      if (!item) {
        return;
      }
      const badge = badgeEl as BadgeView;
      badge.color = item.badgeColor ?? "";
      if (item.icon !== undefined) {
        badge.icon = item.icon;
      }
      if (item.badgeLogo !== undefined) {
        badge.logo = item.badgeLogo;
      }
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-grid")) {
  customElements.define("view-grid", GridView);
}
