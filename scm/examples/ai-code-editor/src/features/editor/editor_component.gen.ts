// AUTO-GENERATED — do not edit. Regenerate with: jsc dom editor_component.yaml
// Source: editor_component.yaml (version 1)

export class EditorBase extends HTMLElement {
  static readonly tagName = 'js-editor';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected gutter!: HTMLDivElement;
  protected highlight!: HTMLPreElement;
  protected highlightCode!: HTMLElement;
  protected languageSelect!: HTMLSelectElement;
  protected reviewBtn!: HTMLButtonElement;
  protected sidebarError!: HTMLParagraphElement;
  protected sidebarTree!: HTMLDivElement;
  protected status!: HTMLElement;
  protected suggestBtn!: HTMLButtonElement;
  protected surface!: HTMLDivElement;
  protected textarea!: HTMLTextAreaElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('editor');

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
    if (!this.gutter) {
      const __el = this.querySelector('[data-part="gutter"]') as HTMLDivElement | null;
      if (__el) {
        this.gutter = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:gutter');
      }
    }
    if (!this.highlight) {
      const __el = this.querySelector('[data-part="highlight"]') as HTMLPreElement | null;
      if (__el) {
        this.highlight = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:highlight');
      }
    }
    if (!this.highlightCode) {
      const __el = this.querySelector('[data-part="highlight-code"]') as HTMLElement | null;
      if (__el) {
        this.highlightCode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:highlight-code');
      }
    }
    if (!this.languageSelect) {
      const __el = this.querySelector('[data-part="language-select"]') as HTMLSelectElement | null;
      if (__el) {
        this.languageSelect = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:language-select');
      }
    }
    if (!this.reviewBtn) {
      const __el = this.querySelector('[data-part="review-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.reviewBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:review-btn');
      }
    }
    if (!this.sidebarError) {
      const __el = this.querySelector('[data-part="sidebar-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.sidebarError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:sidebar-error');
      }
    }
    if (!this.sidebarTree) {
      const __el = this.querySelector('[data-part="sidebar-tree"]') as HTMLDivElement | null;
      if (__el) {
        this.sidebarTree = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:sidebar-tree');
      }
    }
    if (!this.status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLElement | null;
      if (__el) {
        this.status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:status');
      }
    }
    if (!this.suggestBtn) {
      const __el = this.querySelector('[data-part="suggest-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.suggestBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:suggest-btn');
      }
    }
    if (!this.surface) {
      const __el = this.querySelector('[data-part="surface"]') as HTMLDivElement | null;
      if (__el) {
        this.surface = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:surface');
      }
    }
    if (!this.textarea) {
      const __el = this.querySelector('[data-part="textarea"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.textarea = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:editor:editor:textarea');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.gutter && !!this.highlight && !!this.highlightCode && !!this.languageSelect && !!this.reviewBtn && !!this.sidebarError && !!this.sidebarTree && !!this.status && !!this.suggestBtn && !!this.surface && !!this.textarea;
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
