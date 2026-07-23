// AUTO-GENERATED — do not edit. Regenerate with: jsc dom scaffold_component.yaml
// Source: scaffold_component.yaml (version 1)

export class ScaffoldBase extends HTMLElement {
  static readonly tagName = 'js-scaffold';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  // Getter-only stops reassignment (element.button = x); the returned
  // element itself remains a live, mutable DOM node — this does not
  // freeze attributes/children/listeners on what the getter returns.
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #code!: HTMLPreElement;
  get code(): HTMLPreElement {
    if (!this.#code) {
      throw new Error(`[justweb] 'code' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#code;
  }
  #description!: HTMLTextAreaElement;
  get description(): HTMLTextAreaElement {
    if (!this.#description) {
      throw new Error(`[justweb] 'description' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#description;
  }
  #fileMode!: HTMLDivElement;
  get fileMode(): HTMLDivElement {
    if (!this.#fileMode) {
      throw new Error(`[justweb] 'fileMode' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#fileMode;
  }
  #filePath!: HTMLInputElement;
  get filePath(): HTMLInputElement {
    if (!this.#filePath) {
      throw new Error(`[justweb] 'filePath' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#filePath;
  }
  #generateBtn!: HTMLButtonElement;
  get generateBtn(): HTMLButtonElement {
    if (!this.#generateBtn) {
      throw new Error(`[justweb] 'generateBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateBtn;
  }
  #generateProjectBtn!: HTMLButtonElement;
  get generateProjectBtn(): HTMLButtonElement {
    if (!this.#generateProjectBtn) {
      throw new Error(`[justweb] 'generateProjectBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateProjectBtn;
  }
  #modeToggle!: HTMLElement;
  get modeToggle(): HTMLElement {
    if (!this.#modeToggle) {
      throw new Error(`[justweb] 'modeToggle' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#modeToggle;
  }
  #projectDescription!: HTMLTextAreaElement;
  get projectDescription(): HTMLTextAreaElement {
    if (!this.#projectDescription) {
      throw new Error(`[justweb] 'projectDescription' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectDescription;
  }
  #projectFiles!: HTMLDivElement;
  get projectFiles(): HTMLDivElement {
    if (!this.#projectFiles) {
      throw new Error(`[justweb] 'projectFiles' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectFiles;
  }
  #projectImageError!: HTMLParagraphElement;
  get projectImageError(): HTMLParagraphElement {
    if (!this.#projectImageError) {
      throw new Error(`[justweb] 'projectImageError' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectImageError;
  }
  #projectImageInput!: HTMLInputElement;
  get projectImageInput(): HTMLInputElement {
    if (!this.#projectImageInput) {
      throw new Error(`[justweb] 'projectImageInput' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectImageInput;
  }
  #projectImagePreview!: HTMLDivElement;
  get projectImagePreview(): HTMLDivElement {
    if (!this.#projectImagePreview) {
      throw new Error(`[justweb] 'projectImagePreview' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectImagePreview;
  }
  #projectImageThumb!: HTMLImageElement;
  get projectImageThumb(): HTMLImageElement {
    if (!this.#projectImageThumb) {
      throw new Error(`[justweb] 'projectImageThumb' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectImageThumb;
  }
  #projectMode!: HTMLDivElement;
  get projectMode(): HTMLDivElement {
    if (!this.#projectMode) {
      throw new Error(`[justweb] 'projectMode' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectMode;
  }
  #projectResult!: HTMLDivElement;
  get projectResult(): HTMLDivElement {
    if (!this.#projectResult) {
      throw new Error(`[justweb] 'projectResult' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#projectResult;
  }
  #replaceConfirm!: HTMLDivElement;
  get replaceConfirm(): HTMLDivElement {
    if (!this.#replaceConfirm) {
      throw new Error(`[justweb] 'replaceConfirm' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#replaceConfirm;
  }
  #replaceMessage!: HTMLParagraphElement;
  get replaceMessage(): HTMLParagraphElement {
    if (!this.#replaceMessage) {
      throw new Error(`[justweb] 'replaceMessage' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#replaceMessage;
  }
  #result!: HTMLDivElement;
  get result(): HTMLDivElement {
    if (!this.#result) {
      throw new Error(`[justweb] 'result' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#result;
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
    this.classList.add('scaffold');

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
    if (!this.#code) {
      const __el = this.querySelector('[data-part="code"]') as HTMLPreElement | null;
      if (__el) {
        this.#code = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:code');
      }
    }
    if (!this.#description) {
      const __el = this.querySelector('[data-part="description"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.#description = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:description');
      }
    }
    if (!this.#fileMode) {
      const __el = this.querySelector('[data-part="file-mode"]') as HTMLDivElement | null;
      if (__el) {
        this.#fileMode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:file-mode');
      }
    }
    if (!this.#filePath) {
      const __el = this.querySelector('[data-part="file-path"]') as HTMLInputElement | null;
      if (__el) {
        this.#filePath = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:file-path');
      }
    }
    if (!this.#generateBtn) {
      const __el = this.querySelector('[data-part="generate-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#generateBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:generate-btn');
      }
    }
    if (!this.#generateProjectBtn) {
      const __el = this.querySelector('[data-part="generate-project-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#generateProjectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:generate-project-btn');
      }
    }
    if (!this.#modeToggle) {
      const __el = this.querySelector('[data-part="mode-toggle"]') as HTMLElement | null;
      if (__el) {
        this.#modeToggle = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:mode-toggle');
      }
    }
    if (!this.#projectDescription) {
      const __el = this.querySelector('[data-part="project-description"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.#projectDescription = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-description');
      }
    }
    if (!this.#projectFiles) {
      const __el = this.querySelector('[data-part="project-files"]') as HTMLDivElement | null;
      if (__el) {
        this.#projectFiles = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-files');
      }
    }
    if (!this.#projectImageError) {
      const __el = this.querySelector('[data-part="project-image-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#projectImageError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-error');
      }
    }
    if (!this.#projectImageInput) {
      const __el = this.querySelector('[data-part="project-image-input"]') as HTMLInputElement | null;
      if (__el) {
        this.#projectImageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-input');
      }
    }
    if (!this.#projectImagePreview) {
      const __el = this.querySelector('[data-part="project-image-preview"]') as HTMLDivElement | null;
      if (__el) {
        this.#projectImagePreview = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-preview');
      }
    }
    if (!this.#projectImageThumb) {
      const __el = this.querySelector('[data-part="project-image-thumb"]') as HTMLImageElement | null;
      if (__el) {
        this.#projectImageThumb = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-thumb');
      }
    }
    if (!this.#projectMode) {
      const __el = this.querySelector('[data-part="project-mode"]') as HTMLDivElement | null;
      if (__el) {
        this.#projectMode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-mode');
      }
    }
    if (!this.#projectResult) {
      const __el = this.querySelector('[data-part="project-result"]') as HTMLDivElement | null;
      if (__el) {
        this.#projectResult = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-result');
      }
    }
    if (!this.#replaceConfirm) {
      const __el = this.querySelector('[data-part="replace-confirm"]') as HTMLDivElement | null;
      if (__el) {
        this.#replaceConfirm = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:replace-confirm');
      }
    }
    if (!this.#replaceMessage) {
      const __el = this.querySelector('[data-part="replace-message"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#replaceMessage = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:replace-message');
      }
    }
    if (!this.#result) {
      const __el = this.querySelector('[data-part="result"]') as HTMLDivElement | null;
      if (__el) {
        this.#result = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:result');
      }
    }
    if (!this.#status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:status');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#code && !!this.#description && !!this.#fileMode && !!this.#filePath && !!this.#generateBtn && !!this.#generateProjectBtn && !!this.#modeToggle && !!this.#projectDescription && !!this.#projectFiles && !!this.#projectImageError && !!this.#projectImageInput && !!this.#projectImagePreview && !!this.#projectImageThumb && !!this.#projectMode && !!this.#projectResult && !!this.#replaceConfirm && !!this.#replaceMessage && !!this.#result && !!this.#status;
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
  const __existing = customElements.get('js-scaffold');
  if (!__existing) {
    customElements.define('js-scaffold', ScaffoldBase);
  } else if (__existing !== ScaffoldBase) {
    const __msg = "[justweb] custom element 'js-scaffold' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
