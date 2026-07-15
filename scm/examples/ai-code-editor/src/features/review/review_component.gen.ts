// AUTO-GENERATED — do not edit. Regenerate with: jsc dom review_component.yaml
// Source: review_component.yaml (version 1)

export class ReviewBase extends HTMLElement {
  static readonly tagName = 'js-review';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected findings!: HTMLDivElement;
  protected imageAttach!: HTMLElement;
  protected imagePicker!: HTMLElement;
  protected reviewedLabel!: HTMLParagraphElement;
  protected runBtn!: HTMLButtonElement;
  protected status!: HTMLParagraphElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('review');

    // Bind light-DOM children + DDAS stamps.
    this._bindElements();
    if (!this._hasAllElements()) {
      this._lightDomObserver = new MutationObserver(() => {
        this._bindElements();
        if (this._hasAllElements() && this._lightDomObserver) {
          this._lightDomObserver.disconnect();
          this._lightDomObserver = null;
        }
      });
      this._lightDomObserver.observe(this, { childList: true, subtree: true });
    }
  }

  disconnectedCallback(): void {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    if (this._lightDomObserver) {
      this._lightDomObserver.disconnect();
      this._lightDomObserver = null;
    }
  }

  public refresh(): void {
    this._bindElements();
  }

  private _bindElements(): void {
    if (!this.findings) {
      const __el = this.querySelector('[data-part="findings"]') as HTMLDivElement | null;
      if (__el) {
        this.findings = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:findings');
      }
    }
    if (!this.imageAttach) {
      const __el = this.querySelector('[data-part="image-attach"]') as HTMLElement | null;
      if (__el) {
        this.imageAttach = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:image-attach');
      }
    }
    if (!this.imagePicker) {
      const __el = this.querySelector('[data-part="image-picker"]') as HTMLElement | null;
      if (__el) {
        this.imagePicker = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:image-picker');
      }
    }
    if (!this.reviewedLabel) {
      const __el = this.querySelector('[data-part="reviewed-label"]') as HTMLParagraphElement | null;
      if (__el) {
        this.reviewedLabel = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:reviewed-label');
      }
    }
    if (!this.runBtn) {
      const __el = this.querySelector('[data-part="run-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.runBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:run-btn');
      }
    }
    if (!this.status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:status');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.findings && !!this.imageAttach && !!this.imagePicker && !!this.reviewedLabel && !!this.runBtn && !!this.status;
  }
}

if (typeof customElements === 'object' && customElements !== null && typeof customElements.define === 'function') {
  const __existing = customElements.get('js-review');
  if (!__existing) {
    customElements.define('js-review', ReviewBase);
  } else if (__existing !== ReviewBase) {
    const __msg = "[justweb] custom element 'js-review' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
