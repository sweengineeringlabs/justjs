// AUTO-GENERATED — do not edit. Regenerate with: jsc dom home_component.yaml
// Source: home_component.yaml (version 1)

export class HomeBase extends HTMLElement {
  static readonly tagName = 'js-home';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #content!: HTMLDivElement;
  get content(): HTMLDivElement {
    if (!this.#content) {
      throw new Error(`[justweb] 'content' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#content;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('home');

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
    if (!this.#content) {
      const __el = this.querySelector('[data-part="content"]') as HTMLDivElement | null;
      if (__el) {
        this.#content = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:home:home:content');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#content;
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
  const __existing = customElements.get('js-home');
  if (!__existing) {
    customElements.define('js-home', HomeBase);
  } else if (__existing !== HomeBase) {
    const __msg = "[justweb] custom element 'js-home' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
