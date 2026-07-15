import { escapeHtml, escapeAttr } from "./escape.js";

// Real Shadow DOM port of the "attach a screenshot" trigger (button +
// hidden file input) duplicated in chat.ts/scaffold.ts/review.ts
// (ADR-0010). A pure relay of the native picker - no validation, no
// reading. The host owns isSupportedImageType()/readImageFileAsDataUrl()/
// parseDataUrl() (already shared, non-visual functions in
// core/images.ts) and reacts to files-select itself, same sequence it
// runs today, just against reusable markup.
export class ImageAttachView extends HTMLElement {
  #accept = "image/png,image/jpeg,image/webp,image/gif";
  #label = "📷 Attach image";
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get accept(): string {
    return this.#accept;
  }
  set accept(value: string) {
    this.#accept = value;
    this.render();
  }

  get label(): string {
    return this.#label;
  }
  set label(value: string) {
    this.#label = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  // Lets the host re-arm the native picker after rejecting a file
  // (unsupported type/size/unparseable) or after Remove is clicked -
  // the same `input.value = ""` reset every existing copy already
  // performs, now exposed as a real method instead of the host reaching
  // into this element's internals.
  reset(): void {
    const input = this.#root.querySelector<HTMLInputElement>("input");
    if (input) {
      input.value = "";
    }
  }

  private render(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: inline-block; }
        button {
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--accent);
          color: var(--accent-text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        @media (hover: hover) and (pointer: fine) {
          button:hover:not(:disabled) { opacity: 0.9; }
        }
        button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
      </style>
      <input type="file" accept="${escapeAttr(this.#accept)}" hidden />
      <button type="button">${escapeHtml(this.#label)}</button>
    `;
    const input = this.#root.querySelector<HTMLInputElement>("input")!;
    const button = this.#root.querySelector<HTMLButtonElement>("button")!;
    button.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.files && input.files.length > 0) {
        this.dispatchEvent(new CustomEvent("files-select", { detail: { files: input.files }, bubbles: true, composed: true }));
      }
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-image-attach")) {
  customElements.define("view-image-attach", ImageAttachView);
}
