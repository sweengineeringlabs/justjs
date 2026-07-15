import { escapeHtml, escapeAttr } from "./escape.js";

// Real Shadow DOM port of ai-code-editor's renderProviderBadge() -
// visually identical output (40px circle, white glyph, 20px inner
// icon/svg), just as a real Custom Element instead of a 4x-duplicated
// render-to-string function. `logo` is trusted, bundled SVG markup
// (e.g. from simple-icons), the same trust boundary the original 4
// copies already assumed - never sanitized here, same as them, since
// it's compile-time asset data, not user input.
export class BadgeView extends HTMLElement {
  #icon: string | undefined;
  #color = "";
  #logo: string | undefined;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get icon(): string | undefined {
    return this.#icon;
  }
  set icon(value: string | undefined) {
    this.#icon = value;
    this.render();
  }

  get color(): string {
    return this.#color;
  }
  set color(value: string) {
    this.#color = value;
    this.render();
  }

  get logo(): string | undefined {
    return this.#logo;
  }
  set logo(value: string | undefined) {
    this.#logo = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  #glyph(): string {
    if (this.#logo) {
      return this.#logo.replace("<svg ", '<svg fill="currentColor" ');
    }
    return escapeHtml(this.#icon ?? "");
  }

  private render(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: inline-block; line-height: 0; }
        .badge {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-circle, 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 20px;
        }
        .badge :where(svg) {
          width: 20px;
          height: 20px;
        }
      </style>
      <span class="badge" style="background: ${escapeAttr(this.#color)}">${this.#glyph()}</span>
    `;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-badge")) {
  customElements.define("view-badge", BadgeView);
}
