// AUTO-GENERATED — do not edit. Regenerate with: jsc dom workspace_component.yaml
// Source: workspace_component.yaml (version 1)

export class WorkspaceBase extends HTMLElement {
  static readonly tagName = 'js-workspace';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected backBtn!: HTMLButtonElement;
  protected functionList!: HTMLDivElement;
  protected functionListView!: HTMLDivElement;
  protected overviewGrid!: HTMLElement;
  protected stageTitle!: HTMLHeadingElement;
  protected subscreenView!: HTMLDivElement;
  protected workspaceView!: HTMLDivElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('workspace');

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
    if (!this.backBtn) {
      const __el = this.querySelector('[data-part="back-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.backBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:back-btn');
      }
    }
    if (!this.functionList) {
      const __el = this.querySelector('[data-part="function-list"]') as HTMLDivElement | null;
      if (__el) {
        this.functionList = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:function-list');
      }
    }
    if (!this.functionListView) {
      const __el = this.querySelector('[data-part="function-list-view"]') as HTMLDivElement | null;
      if (__el) {
        this.functionListView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:function-list-view');
      }
    }
    if (!this.overviewGrid) {
      const __el = this.querySelector('[data-part="overview-grid"]') as HTMLElement | null;
      if (__el) {
        this.overviewGrid = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:overview-grid');
      }
    }
    if (!this.stageTitle) {
      const __el = this.querySelector('[data-part="stage-title"]') as HTMLHeadingElement | null;
      if (__el) {
        this.stageTitle = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:stage-title');
      }
    }
    if (!this.subscreenView) {
      const __el = this.querySelector('[data-part="subscreen-view"]') as HTMLDivElement | null;
      if (__el) {
        this.subscreenView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:subscreen-view');
      }
    }
    if (!this.workspaceView) {
      const __el = this.querySelector('[data-part="workspace-view"]') as HTMLDivElement | null;
      if (__el) {
        this.workspaceView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:workspace:workspace:workspace-view');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.backBtn && !!this.functionList && !!this.functionListView && !!this.overviewGrid && !!this.stageTitle && !!this.subscreenView && !!this.workspaceView;
  }
}

if (typeof customElements === 'object' && customElements !== null && typeof customElements.define === 'function') {
  const __existing = customElements.get('js-workspace');
  if (!__existing) {
    customElements.define('js-workspace', WorkspaceBase);
  } else if (__existing !== WorkspaceBase) {
    const __msg = "[justweb] custom element 'js-workspace' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
