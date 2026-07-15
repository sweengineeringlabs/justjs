import { escapeHtml, escapeAttr } from "./escape.js";

// Real Shadow DOM port of the "after a file is picked" preview
// (thumbnail + label + Remove button + error line) duplicated in
// chat.ts/scaffold.ts/review.ts (ADR-0010). Pairs with
// <view-image-attach> - the host sets `dataUrl`/`error` after running
// its own validate/read sequence and listens for `clear` to reset its
// pending-image state, same as it does today.
export class ImagePickerView extends HTMLElement {
  #dataUrl = "";
  #label = "Screenshot attached";
  #error = "";
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get dataUrl(): string {
    return this.#dataUrl;
  }
  set dataUrl(value: string) {
    this.#dataUrl = value;
    this.render();
  }

  get label(): string {
    return this.#label;
  }
  set label(value: string) {
    this.#label = value;
    this.render();
  }

  get error(): string {
    return this.#error;
  }
  set error(value: string) {
    this.#error = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    const showPreview = this.#dataUrl.length > 0;
    const showError = this.#error.length > 0;
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .preview {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          margin-bottom: 8px;
          background: var(--surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow);
        }
        .preview img {
          width: 44px;
          height: 44px;
          object-fit: cover;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
        }
        .label {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          color: var(--text-muted);
        }
        .remove-btn {
          flex: 0 0 auto;
          border: none;
          padding: 6px 12px;
          font-size: 12px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--surface-alt);
          color: var(--text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        .remove-btn:active { transform: scale(0.97); opacity: 0.85; }
        @media (hover: hover) and (pointer: fine) {
          .remove-btn:hover { opacity: 0.9; }
        }
        .remove-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .error {
          margin: 0 0 8px;
          font-size: 12px;
          color: var(--danger);
        }
      </style>
      ${
        showPreview
          ? `
        <div class="preview">
          <img src="${escapeAttr(this.#dataUrl)}" alt="Attached screenshot" />
          <span class="label">${escapeHtml(this.#label)}</span>
          <button type="button" class="remove-btn">Remove</button>
        </div>
      `
          : ""
      }
      ${showError ? `<p class="error">${escapeHtml(this.#error)}</p>` : ""}
    `;
    this.#root.querySelector(".remove-btn")?.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("clear", { bubbles: true, composed: true }));
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-image-picker")) {
  customElements.define("view-image-picker", ImagePickerView);
}
