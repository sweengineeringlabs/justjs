// AUTO-GENERATED — do not edit. Regenerate with: jsc dom socials_component.yaml
// Source: socials_component.yaml (version 1)

export class SocialsBase extends HTMLElement {
  static readonly tagName = 'js-socials';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #connector!: HTMLElement;
  get connector(): HTMLElement {
    if (!this.#connector) {
      throw new Error(`[justweb] 'connector' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connector;
  }
  #pageHeader!: HTMLElement;
  get pageHeader(): HTMLElement {
    if (!this.#pageHeader) {
      throw new Error(`[justweb] 'pageHeader' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#pageHeader;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('socials');

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
    if (!this.#connector) {
      const __el = this.querySelector('[data-part="connector"]') as HTMLElement | null;
      if (__el) {
        this.#connector = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:socials:socials:connector');
      }
    }
    if (!this.#pageHeader) {
      const __el = this.querySelector('[data-part="page-header"]') as HTMLElement | null;
      if (__el) {
        this.#pageHeader = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:socials:socials:page-header');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#connector && !!this.#pageHeader;
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
  const __existing = customElements.get('js-socials');
  if (!__existing) {
    customElements.define('js-socials', SocialsBase);
  } else if (__existing !== SocialsBase) {
    const __msg = "[justweb] custom element 'js-socials' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
