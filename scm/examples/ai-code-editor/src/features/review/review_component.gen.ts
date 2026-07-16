// AUTO-GENERATED — do not edit. Regenerate with: jsc dom review_component.yaml
// Source: review_component.yaml (version 1)

export class ReviewBase extends HTMLElement {
  static readonly tagName = 'js-review';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #findings!: HTMLDivElement;
  get findings(): HTMLDivElement {
    if (!this.#findings) {
      throw new Error(`[justweb] 'findings' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#findings;
  }
  #imageAttach!: HTMLElement;
  get imageAttach(): HTMLElement {
    if (!this.#imageAttach) {
      throw new Error(`[justweb] 'imageAttach' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imageAttach;
  }
  #imagePicker!: HTMLElement;
  get imagePicker(): HTMLElement {
    if (!this.#imagePicker) {
      throw new Error(`[justweb] 'imagePicker' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imagePicker;
  }
  #reviewedLabel!: HTMLParagraphElement;
  get reviewedLabel(): HTMLParagraphElement {
    if (!this.#reviewedLabel) {
      throw new Error(`[justweb] 'reviewedLabel' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#reviewedLabel;
  }
  #runBtn!: HTMLButtonElement;
  get runBtn(): HTMLButtonElement {
    if (!this.#runBtn) {
      throw new Error(`[justweb] 'runBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#runBtn;
  }
  #status!: HTMLParagraphElement;
  get status(): HTMLParagraphElement {
    if (!this.#status) {
      throw new Error(`[justweb] 'status' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#status;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('review');

    // Bind light-DOM children + DDAS stamps.
    this._bindElements();
    if (!this._hasAllElements()) {
      this._lightDomObserver = new MutationObserver(() => {
        this._bindElements();
        if (this._hasAllElements() && this._lightDomObserver) {
          this._lightDomObserver.disconnect();
          this._lightDomObserver = null;
          this._watchDdasIntegrity();
        }
      });
      this._lightDomObserver.observe(this, { childList: true, subtree: true });
    } else {
      this._watchDdasIntegrity();
    }
  }

  disconnectedCallback(): void {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    if (this._lightDomObserver) {
      this._lightDomObserver.disconnect();
      this._lightDomObserver = null;
    }
    if (this._ddasIntegrityObserver) {
      this._ddasIntegrityObserver.disconnect();
      this._ddasIntegrityObserver = null;
    }
  }

  public refresh(): void {
    this._bindElements();
  }

  private _bindElements(): void {
    if (!this.#findings) {
      const __el = this.querySelector('[data-part="findings"]') as HTMLDivElement | null;
      if (__el) {
        this.#findings = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:findings');
      }
    }
    if (!this.#imageAttach) {
      const __el = this.querySelector('[data-part="image-attach"]') as HTMLElement | null;
      if (__el) {
        this.#imageAttach = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:image-attach');
      }
    }
    if (!this.#imagePicker) {
      const __el = this.querySelector('[data-part="image-picker"]') as HTMLElement | null;
      if (__el) {
        this.#imagePicker = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:image-picker');
      }
    }
    if (!this.#reviewedLabel) {
      const __el = this.querySelector('[data-part="reviewed-label"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#reviewedLabel = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:reviewed-label');
      }
    }
    if (!this.#runBtn) {
      const __el = this.querySelector('[data-part="run-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#runBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:run-btn');
      }
    }
    if (!this.#status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:review:review:status');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#findings && !!this.#imageAttach && !!this.#imagePicker && !!this.#reviewedLabel && !!this.#runBtn && !!this.#status;
  }

  private _watchDdasIntegrity(): void {
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    const __observer = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type !== 'attributes' || rec.attributeName !== 'data-ddas-id') continue;
        const __target = rec.target as Element;
        const __current = __target.getAttribute('data-ddas-id');
        if (__current === rec.oldValue) continue;
        const __msg = `[justweb] data-ddas-id mutated or removed on <${__target.tagName.toLowerCase()}> (was '${rec.oldValue}', now '${__current}')`;
        if (__strict) { throw new Error(__msg); }
        console.warn(__msg);
      }
    });
    __observer.observe(this, { attributes: true, attributeFilter: ['data-ddas-id'], subtree: true, attributeOldValue: true });
    this._ddasIntegrityObserver = __observer;
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
