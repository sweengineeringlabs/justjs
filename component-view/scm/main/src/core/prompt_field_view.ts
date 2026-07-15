import { escapeHtml, escapeAttr } from "./escape.js";

// Real Shadow DOM port of the "describe what you want" labeled
// textarea duplicated in cartoon.ts/scaffold.ts x2/workspace.ts x2
// (ADR-0011). Voice/mic input is deliberately excluded - checked
// scaffold.ts's/chat.ts's mic wiring directly, it owns real, separate
// stateful behavior (a live voice session, hold-to-record gesture,
// live transcript streaming) that's out of scope for a plain view.
//
// render() reads the textarea's own live value before rebuilding, so
// a label/placeholder/rows change never clobbers in-progress typed
// text - the same reason `value`'s own setter/getter go straight to
// the live textarea instead of always routing through a full re-render.
export class PromptFieldView extends HTMLElement {
  #label: string | undefined;
  #placeholder = "";
  #rows = 3;
  #pendingValue = "";
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get label(): string | undefined {
    return this.#label;
  }
  set label(value: string | undefined) {
    this.#label = value;
    this.render();
  }

  get placeholder(): string {
    return this.#placeholder;
  }
  set placeholder(value: string) {
    this.#placeholder = value;
    this.render();
  }

  get rows(): number {
    return this.#rows;
  }
  set rows(value: number) {
    this.#rows = value;
    this.render();
  }

  get value(): string {
    return this.#root.querySelector<HTMLTextAreaElement>("textarea")?.value ?? this.#pendingValue;
  }
  set value(value: string) {
    this.#pendingValue = value;
    const textarea = this.#root.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) {
      textarea.value = value;
    } else {
      this.render();
    }
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    const currentValue = this.#root.querySelector<HTMLTextAreaElement>("textarea")?.value ?? this.#pendingValue;
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          padding-left: 2px;
        }
        textarea {
          box-sizing: border-box;
          width: 100%;
          resize: vertical;
          padding: 10px 12px;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
          font-family: inherit;
        }
        textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
      </style>
      <div class="field">
        ${this.#label !== undefined ? `<span class="field-label">${escapeHtml(this.#label)}</span>` : ""}
        <textarea rows="${this.#rows}" placeholder="${escapeAttr(this.#placeholder)}"></textarea>
      </div>
    `;
    const textarea = this.#root.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = currentValue;
    this.#pendingValue = currentValue;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-prompt-field")) {
  customElements.define("view-prompt-field", PromptFieldView);
}
