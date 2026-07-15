import { escapeHtml, escapeAttr } from "./escape.js";
import type { ToggleOption } from "../api/toggle_view.js";

// Real Shadow DOM port of the 2-way segmented toggle duplicated 3x
// (workspace.ts's Design and Slides Edit/Preview toggles, scaffold.ts's
// New File/New Project toggle - ADR-0012). Checked which value is
// "active" in all 3: always data the host already tracks
// (designViewMode/slidesViewMode/Scaffold's mode), so this is a fully
// controlled view - props in (options, activeValue), a `change` event
// out. It never mutates its own activeValue; the host must set it
// again after handling `change` for the visual state to update.
export class ToggleView extends HTMLElement {
  #options: readonly ToggleOption[] = [];
  #activeValue = "";
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get options(): readonly ToggleOption[] {
    return this.#options;
  }
  set options(value: readonly ToggleOption[]) {
    this.#options = value;
    this.render();
  }

  get activeValue(): string {
    return this.#activeValue;
  }
  set activeValue(value: string) {
    this.#activeValue = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: block; margin-bottom: 12px; }
        .toggle {
          display: flex;
          gap: 6px;
        }
        .toggle-btn {
          flex: 1;
          border: none;
          padding: 8px;
          font-size: 12px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--surface-alt);
          color: var(--text-muted);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        .toggle-btn.active {
          background: var(--accent);
          color: var(--accent-text);
        }
        .toggle-btn:active { transform: scale(0.97); opacity: 0.85; }
        @media (hover: hover) and (pointer: fine) {
          .toggle-btn:not(.active):hover { opacity: 0.9; }
        }
        .toggle-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
      </style>
      <div class="toggle">
        ${this.#options
          .map(
            (option) =>
              `<button type="button" class="toggle-btn${option.value === this.#activeValue ? " active" : ""}" data-value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</button>`
          )
          .join("")}
      </div>
    `;
    this.#root.querySelectorAll<HTMLButtonElement>(".toggle-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.value ?? "";
        this.dispatchEvent(new CustomEvent("change", { detail: { value }, bubbles: true, composed: true }));
      });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-toggle")) {
  customElements.define("view-toggle", ToggleView);
}
