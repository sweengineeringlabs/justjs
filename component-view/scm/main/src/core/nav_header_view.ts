import { escapeHtml } from "./escape.js";

// Real Shadow DOM port of ai-code-editor's .dash-subnav/.dash-back-btn/
// .workspace-stage-title trio (ADR-0008) - the single most duplicated
// pattern found in that app (10 copies in workspace.ts alone). No
// internal state owned (no selection/loading/error), so this is a
// view-*, not a control-*, even though it dispatches one event - same
// bar <view-badge> was held to.
//
// `title` intentionally shadows HTMLElement's native tooltip `title`
// IDL attribute - this element repurposes it as the header text, never
// reflects it to the `title` content attribute, so no native tooltip
// side effect exists. Matches ADR-0008's own property naming exactly.
//
// The default <slot> lets a caller compose arbitrary content (e.g. a
// <view-badge> next to the name, socials.ts's provider-detail header)
// instead of the plain icon+title fallback - the element itself never
// special-cases what's inside.
export class NavHeaderView extends HTMLElement {
  #icon: string | undefined;
  #headerTitle: string | undefined;
  #backLabel: string | undefined;
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

  override get title(): string {
    return this.#headerTitle ?? "";
  }
  override set title(value: string) {
    this.#headerTitle = value;
    this.render();
  }

  get backLabel(): string | undefined {
    return this.#backLabel;
  }
  set backLabel(value: string | undefined) {
    this.#backLabel = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  #fallbackContent(): string {
    const iconPrefix = this.#icon ? `${escapeHtml(this.#icon)} ` : "";
    return `${iconPrefix}${escapeHtml(this.#headerTitle ?? "")}`;
  }

  private render(): void {
    const backButton =
      this.#backLabel !== undefined
        ? `<button type="button" class="back-btn">← ${escapeHtml(this.#backLabel)}</button>`
        : "";
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .subnav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .back-btn {
          flex: 0 0 auto;
          border: none;
          padding: 8px 14px;
          font-size: 13px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--stage-color, var(--accent)) 16%, var(--surface-alt));
          color: var(--text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        .back-btn:active { transform: scale(0.97); opacity: 0.85; }
        .back-btn:disabled { opacity: 0.5; cursor: default; }
        @media (hover: hover) and (pointer: fine) {
          .back-btn:hover:not(:disabled) { opacity: 0.9; }
        }
        .back-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .title {
          margin: 0;
          font-size: 16px;
          padding-left: 10px;
          border-left: 3px solid var(--stage-color, var(--accent));
          display: flex;
          align-items: center;
          gap: 8px;
        }
      </style>
      <div class="subnav">
        ${backButton}
        <h2 class="title"><slot>${this.#fallbackContent()}</slot></h2>
      </div>
    `;
    this.#root.querySelector(".back-btn")?.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("nav-back", { bubbles: true, composed: true }));
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-nav-header")) {
  customElements.define("view-nav-header", NavHeaderView);
}
