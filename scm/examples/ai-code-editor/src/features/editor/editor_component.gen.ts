// AUTO-GENERATED — do not edit. Regenerate with: jsc dom editor_component.yaml
// Source: editor_component.yaml (version 1)

export class EditorBase extends HTMLElement {
  static readonly tagName = 'js-editor';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  // Getter-only stops reassignment (element.button = x); the returned
  // element itself remains a live, mutable DOM node — this does not
  // freeze attributes/children/listeners on what the getter returns.
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #gutter!: HTMLDivElement;
  get gutter(): HTMLDivElement {
    if (!this.#gutter) {
      throw new Error(`[justweb] 'gutter' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#gutter;
  }
  #highlight!: HTMLPreElement;
  get highlight(): HTMLPreElement {
    if (!this.#highlight) {
      throw new Error(`[justweb] 'highlight' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#highlight;
  }
  #highlightCode!: HTMLElement;
  get highlightCode(): HTMLElement {
    if (!this.#highlightCode) {
      throw new Error(`[justweb] 'highlightCode' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#highlightCode;
  }
  #languageSelect!: HTMLSelectElement;
  get languageSelect(): HTMLSelectElement {
    if (!this.#languageSelect) {
      throw new Error(`[justweb] 'languageSelect' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#languageSelect;
  }
  #reviewBtn!: HTMLButtonElement;
  get reviewBtn(): HTMLButtonElement {
    if (!this.#reviewBtn) {
      throw new Error(`[justweb] 'reviewBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#reviewBtn;
  }
  #sidebarError!: HTMLParagraphElement;
  get sidebarError(): HTMLParagraphElement {
    if (!this.#sidebarError) {
      throw new Error(`[justweb] 'sidebarError' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#sidebarError;
  }
  #sidebarTree!: HTMLDivElement;
  get sidebarTree(): HTMLDivElement {
    if (!this.#sidebarTree) {
      throw new Error(`[justweb] 'sidebarTree' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#sidebarTree;
  }
  #status!: HTMLElement;
  get status(): HTMLElement {
    if (!this.#status) {
      throw new Error(`[justweb] 'status' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#status;
  }
  #suggestBtn!: HTMLButtonElement;
  get suggestBtn(): HTMLButtonElement {
    if (!this.#suggestBtn) {
      throw new Error(`[justweb] 'suggestBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#suggestBtn;
  }
  #surface!: HTMLDivElement;
  get surface(): HTMLDivElement {
    if (!this.#surface) {
      throw new Error(`[justweb] 'surface' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#surface;
  }
  #textarea!: HTMLTextAreaElement;
  get textarea(): HTMLTextAreaElement {
    if (!this.#textarea) {
      throw new Error(`[justweb] 'textarea' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#textarea;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('editor');

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
    if (!this.#gutter) {
      const __el = this.querySelector('[data-part="gutter"]') as HTMLDivElement | null;
      if (__el) {
        this.#gutter = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:gutter');
      }
    }
    if (!this.#highlight) {
      const __el = this.querySelector('[data-part="highlight"]') as HTMLPreElement | null;
      if (__el) {
        this.#highlight = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:highlight');
      }
    }
    if (!this.#highlightCode) {
      const __el = this.querySelector('[data-part="highlight-code"]') as HTMLElement | null;
      if (__el) {
        this.#highlightCode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:highlight-code');
      }
    }
    if (!this.#languageSelect) {
      const __el = this.querySelector('[data-part="language-select"]') as HTMLSelectElement | null;
      if (__el) {
        this.#languageSelect = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:language-select');
      }
    }
    if (!this.#reviewBtn) {
      const __el = this.querySelector('[data-part="review-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#reviewBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:review-btn');
      }
    }
    if (!this.#sidebarError) {
      const __el = this.querySelector('[data-part="sidebar-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#sidebarError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:sidebar-error');
      }
    }
    if (!this.#sidebarTree) {
      const __el = this.querySelector('[data-part="sidebar-tree"]') as HTMLDivElement | null;
      if (__el) {
        this.#sidebarTree = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:sidebar-tree');
      }
    }
    if (!this.#status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLElement | null;
      if (__el) {
        this.#status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:status');
      }
    }
    if (!this.#suggestBtn) {
      const __el = this.querySelector('[data-part="suggest-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#suggestBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:suggest-btn');
      }
    }
    if (!this.#surface) {
      const __el = this.querySelector('[data-part="surface"]') as HTMLDivElement | null;
      if (__el) {
        this.#surface = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:surface');
      }
    }
    if (!this.#textarea) {
      const __el = this.querySelector('[data-part="textarea"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.#textarea = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:textarea');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#gutter && !!this.#highlight && !!this.#highlightCode && !!this.#languageSelect && !!this.#reviewBtn && !!this.#sidebarError && !!this.#sidebarTree && !!this.#status && !!this.#suggestBtn && !!this.#surface && !!this.#textarea;
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
  const __existing = customElements.get('js-editor');
  if (!__existing) {
    customElements.define('js-editor', EditorBase);
  } else if (__existing !== EditorBase) {
    const __msg = "[justweb] custom element 'js-editor' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
