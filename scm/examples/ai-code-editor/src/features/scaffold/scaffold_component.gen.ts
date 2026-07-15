// AUTO-GENERATED — do not edit. Regenerate with: jsc dom scaffold_component.yaml
// Source: scaffold_component.yaml (version 1)

export class ScaffoldBase extends HTMLElement {
  static readonly tagName = 'js-scaffold';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected code!: HTMLPreElement;
  protected description!: HTMLTextAreaElement;
  protected fileMode!: HTMLDivElement;
  protected filePath!: HTMLInputElement;
  protected generateBtn!: HTMLButtonElement;
  protected generateProjectBtn!: HTMLButtonElement;
  protected modeToggle!: HTMLElement;
  protected projectDescription!: HTMLTextAreaElement;
  protected projectFiles!: HTMLDivElement;
  protected projectImageError!: HTMLParagraphElement;
  protected projectImageInput!: HTMLInputElement;
  protected projectImagePreview!: HTMLDivElement;
  protected projectImageThumb!: HTMLImageElement;
  protected projectMode!: HTMLDivElement;
  protected projectResult!: HTMLDivElement;
  protected replaceConfirm!: HTMLDivElement;
  protected replaceMessage!: HTMLParagraphElement;
  protected result!: HTMLDivElement;
  protected status!: HTMLParagraphElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('scaffold');

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
    if (!this.code) {
      const __el = this.querySelector('[data-part="code"]') as HTMLPreElement | null;
      if (__el) {
        this.code = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:code');
      }
    }
    if (!this.description) {
      const __el = this.querySelector('[data-part="description"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.description = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:description');
      }
    }
    if (!this.fileMode) {
      const __el = this.querySelector('[data-part="file-mode"]') as HTMLDivElement | null;
      if (__el) {
        this.fileMode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:file-mode');
      }
    }
    if (!this.filePath) {
      const __el = this.querySelector('[data-part="file-path"]') as HTMLInputElement | null;
      if (__el) {
        this.filePath = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:file-path');
      }
    }
    if (!this.generateBtn) {
      const __el = this.querySelector('[data-part="generate-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.generateBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:generate-btn');
      }
    }
    if (!this.generateProjectBtn) {
      const __el = this.querySelector('[data-part="generate-project-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.generateProjectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:generate-project-btn');
      }
    }
    if (!this.modeToggle) {
      const __el = this.querySelector('[data-part="mode-toggle"]') as HTMLElement | null;
      if (__el) {
        this.modeToggle = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:mode-toggle');
      }
    }
    if (!this.projectDescription) {
      const __el = this.querySelector('[data-part="project-description"]') as HTMLTextAreaElement | null;
      if (__el) {
        this.projectDescription = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-description');
      }
    }
    if (!this.projectFiles) {
      const __el = this.querySelector('[data-part="project-files"]') as HTMLDivElement | null;
      if (__el) {
        this.projectFiles = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-files');
      }
    }
    if (!this.projectImageError) {
      const __el = this.querySelector('[data-part="project-image-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.projectImageError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-error');
      }
    }
    if (!this.projectImageInput) {
      const __el = this.querySelector('[data-part="project-image-input"]') as HTMLInputElement | null;
      if (__el) {
        this.projectImageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-input');
      }
    }
    if (!this.projectImagePreview) {
      const __el = this.querySelector('[data-part="project-image-preview"]') as HTMLDivElement | null;
      if (__el) {
        this.projectImagePreview = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-preview');
      }
    }
    if (!this.projectImageThumb) {
      const __el = this.querySelector('[data-part="project-image-thumb"]') as HTMLImageElement | null;
      if (__el) {
        this.projectImageThumb = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-image-thumb');
      }
    }
    if (!this.projectMode) {
      const __el = this.querySelector('[data-part="project-mode"]') as HTMLDivElement | null;
      if (__el) {
        this.projectMode = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-mode');
      }
    }
    if (!this.projectResult) {
      const __el = this.querySelector('[data-part="project-result"]') as HTMLDivElement | null;
      if (__el) {
        this.projectResult = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:project-result');
      }
    }
    if (!this.replaceConfirm) {
      const __el = this.querySelector('[data-part="replace-confirm"]') as HTMLDivElement | null;
      if (__el) {
        this.replaceConfirm = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:replace-confirm');
      }
    }
    if (!this.replaceMessage) {
      const __el = this.querySelector('[data-part="replace-message"]') as HTMLParagraphElement | null;
      if (__el) {
        this.replaceMessage = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:replace-message');
      }
    }
    if (!this.result) {
      const __el = this.querySelector('[data-part="result"]') as HTMLDivElement | null;
      if (__el) {
        this.result = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:result');
      }
    }
    if (!this.status) {
      const __el = this.querySelector('[data-part="status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.status = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:scaffold:scaffold:status');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.code && !!this.description && !!this.fileMode && !!this.filePath && !!this.generateBtn && !!this.generateProjectBtn && !!this.modeToggle && !!this.projectDescription && !!this.projectFiles && !!this.projectImageError && !!this.projectImageInput && !!this.projectImagePreview && !!this.projectImageThumb && !!this.projectMode && !!this.projectResult && !!this.replaceConfirm && !!this.replaceMessage && !!this.result && !!this.status;
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
