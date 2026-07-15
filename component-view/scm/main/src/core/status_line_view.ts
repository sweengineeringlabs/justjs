import { escapeHtml } from "./escape.js";

// Real Shadow DOM port of ai-code-editor's .editor-status +
// showStatus(text)/hideStatus() pair (ADR-0009) - checked all 5
// existing copies directly: no timers, no async state, purely text in,
// visible/hidden markup out. One property replaces both methods: empty
// string hides, non-empty shows with that text.
export class StatusLineView extends HTMLElement {
  #text = "";
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get text(): string {
    return this.#text;
  }
  set text(value: string) {
    this.#text = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    const hidden = this.#text.length === 0;
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        p {
          margin: 8px 2px 0;
          font-size: 12px;
          color: var(--text-muted);
        }
      </style>
      <p${hidden ? " hidden" : ""}>${escapeHtml(this.#text)}</p>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-status-line")) {
  customElements.define("view-status-line", StatusLineView);
}
