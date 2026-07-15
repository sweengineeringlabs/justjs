import "@justjs/component-view";
import type { NavHeaderView, StatusLineView } from "@justjs/component-view";
import { renderMarkdownToHtml } from "../core/markdown.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The real AI call - the control never talks to a provider/API-key
// check itself (matches ADR-0007's "caller supplies the actual call"
// split). A missing-API-key condition is just a rejected promise whose
// message is the exact text to show (e.g. "Add an Anthropic API key in
// Settings to generate a design doc.") - one failure path, not two, the
// control always prefixes whatever message it catches with the same
// "⚠️ " every other AI action in this app already uses.
export type GenerateFunction = (description: string) => Promise<string>;

// The real file-creation side effect (path validation, collision check
// via pathExists, store dispatch, navigateTo) all happen host-side -
// same full-ownership split CliRunFunction (justjs#122) already uses,
// since both need this app's own store state the control never touches
// directly. Returns ok:false with an inline-displayable error instead
// of throwing, matching the original's own non-exceptional validation
// style.
export type CreateFileFunction = (path: string, content: string) => { ok: boolean; error?: string };

export interface DocGeneratorConfig {
  readonly icon: string;
  readonly heading: string;
  readonly backLabel: string;
  readonly descriptionLabel: string;
  readonly descriptionPlaceholder: string;
  readonly defaultFilePath: string;
}

// Real Shadow DOM extraction of x-workspace's Design generator
// (justjs#123, part of justjs#119's decomposition) - a Markdown+Mermaid
// "describe -> generate -> edit/preview -> create file" flow. Base for
// PresentationGeneratorControl, which is the same flow plus slide
// splitting/nav - confirmed near-total structural duplication (same
// CSS classes even) before extracting, not a speculative shared base.
// Registers itself as control-design-generator since Design uses this
// flow with zero behavioral deltas; Presentation subclasses it.
export class DocGeneratorControl extends HTMLElement {
  #description = "";
  #doc: string | null = null;
  #viewMode: "edit" | "preview" = "edit";
  #renderToken = 0;
  #generate: GenerateFunction | undefined;
  #createFile: CreateFileFunction | undefined;
  protected readonly root: ShadowRoot;
  private readonly config: DocGeneratorConfig;

  constructor(config: DocGeneratorConfig) {
    super();
    this.config = config;
    this.root = this.attachShadow({ mode: "open" });
  }

  set generate(fn: GenerateFunction | undefined) {
    this.#generate = fn;
  }

  set createFile(fn: CreateFileFunction | undefined) {
    this.#createFile = fn;
  }

  protected get doc(): string | null {
    return this.#doc;
  }

  connectedCallback(): void {
    this.render();
  }

  // Hooks a subclass (PresentationGeneratorControl) overrides - the
  // base's own behavior (whole-doc preview, no extra toolbar) is
  // exactly Design's real shape, not a stubbed-out default.
  protected extraPreviewMarkup(): string {
    return "";
  }
  protected extraPreviewClass(): string {
    return "";
  }
  protected bindExtraPreviewControls(): void {}
  protected currentPreviewSource(): string {
    return this.#doc ?? "";
  }
  protected onDocChanged(): void {}
  protected afterPreviewRendered(): void {}

  private render(): void {
    this.root.innerHTML = `
      <style>
        :host { display: block; }
        .design-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px; }
        .field { display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); padding-left: 2px; }
        textarea, input {
          box-sizing: border-box;
          padding: 10px 12px;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
          font-family: inherit;
        }
        textarea:focus, input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        #description { width: 100%; resize: vertical; }
        button {
          align-self: flex-start;
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--accent);
          color: var(--accent-text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        @media (hover: hover) and (pointer: fine) {
          button:hover:not(:disabled) { opacity: 0.9; }
        }
        button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .result { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
        .mode-toggle { display: flex; gap: 6px; }
        .mode-btn { flex: 1; align-self: auto; padding: 8px; font-size: 12px; background: var(--surface-alt); color: var(--text-muted); }
        .mode-btn.active { background: var(--accent); color: var(--accent-text); }
        .source {
          width: 100%;
          min-height: 220px;
          font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          line-height: 1.5;
          resize: vertical;
        }
        .preview-area { display: flex; flex-direction: column; gap: 10px; }
        .rendering-status { margin: 8px 2px 0; font-size: 12px; color: var(--text-muted); }
        .slides-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .slides-nav button { flex: 0 0 auto; align-self: auto; padding: 6px 12px; font-size: 12px; }
        .slides-indicator { font-size: 12px; font-weight: 600; color: var(--text-muted); }
        .preview {
          min-height: 220px;
          max-height: 420px;
          overflow-y: auto;
          padding: 14px 16px;
          background: var(--surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow);
          font-size: 14px;
          line-height: 1.5;
        }
        .preview h1, .preview h2, .preview h3, .preview h4, .preview h5, .preview h6 { margin: 14px 0 8px; line-height: 1.3; }
        .preview h1:first-child, .preview h2:first-child, .preview h3:first-child { margin-top: 0; }
        .preview p { margin: 0 0 10px; }
        .preview ul, .preview ol { margin: 0 0 10px; padding-left: 22px; }
        .preview li { margin: 4px 0; }
        .preview code { font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: var(--surface-alt); padding: 2px 5px; border-radius: var(--radius-sm); }
        .preview pre { margin: 0 0 10px; padding: 10px 12px; background: var(--surface-alt); border-radius: var(--radius-md); overflow-x: auto; }
        .preview pre code { background: transparent; padding: 0; }
        .preview a { color: var(--accent-strong); }
        .preview hr { border: none; border-top: 1px solid var(--border); margin: 14px 0; }
        .preview.slides-preview { min-height: 180px; }
        .mermaid-diagram { display: flex; justify-content: center; margin: 10px 0; overflow-x: auto; }
        .mermaid-diagram svg { max-width: 100%; height: auto; }
        .mermaid-fallback { margin: 10px 0; padding: 10px 12px; background: color-mix(in srgb, var(--warning) 12%, transparent); border-radius: var(--radius-md); }
        .mermaid-fallback-note { margin: 0 0 8px; font-size: 12px; color: var(--text-muted); }
        .create-row { display: flex; gap: 8px; }
        #file-path { flex: 1; min-width: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        #create-btn { flex: 0 0 auto; align-self: auto; }
        .create-error { margin: 0 0 8px; font-size: 12px; color: var(--danger); }
      </style>
      <view-nav-header id="header"></view-nav-header>
      <div class="design-form">
        <label class="field">
          <span class="field-label">${escapeHtml(this.config.descriptionLabel)}</span>
          <textarea id="description" rows="4" placeholder="${escapeHtml(this.config.descriptionPlaceholder)}"></textarea>
        </label>
        <button id="generate-btn" type="button">Generate</button>
      </div>
      <view-status-line id="status"></view-status-line>
      <div id="result" class="result" ${this.#doc ? "" : "hidden"}>
        <div class="mode-toggle">
          <button id="mode-edit-btn" type="button" class="mode-btn active">Edit</button>
          <button id="mode-preview-btn" type="button" class="mode-btn">Preview</button>
        </div>
        <textarea id="source" class="source" rows="10">${this.#doc ? escapeHtml(this.#doc) : ""}</textarea>
        <div id="preview-area" class="preview-area" hidden>
          ${this.extraPreviewMarkup()}
          <div class="preview ${this.extraPreviewClass()}"></div>
        </div>
        <div class="create-row">
          <input id="file-path" type="text" value="${escapeHtml(this.config.defaultFilePath)}" autocomplete="off" spellcheck="false" />
          <button id="create-btn" type="button">Create file</button>
        </div>
        <p id="create-error" class="create-error" hidden></p>
      </div>
    `;

    const header = this.root.querySelector<NavHeaderView>("#header")!;
    // icon/title are private-field-backed accessors on NavHeaderView, not
    // reflected HTML attributes - must be set via JS property assignment,
    // not inline in the template string above (real bug caught while
    // migrating justjs#124, fixed here and in CliTerminalControl).
    header.icon = this.config.icon;
    header.title = this.config.heading;
    header.backLabel = this.config.backLabel;
    header.addEventListener("nav-back", () => {
      this.dispatchEvent(new CustomEvent("back", { bubbles: true, composed: true }));
    });

    const descriptionInput = this.root.querySelector<HTMLTextAreaElement>("#description")!;
    descriptionInput.value = this.#description;
    descriptionInput.addEventListener("input", () => {
      this.#description = descriptionInput.value;
    });

    const sourceEl = this.root.querySelector<HTMLTextAreaElement>("#source")!;
    sourceEl.addEventListener("input", () => {
      this.#doc = sourceEl.value;
    });

    this.root.querySelector("#generate-btn")?.addEventListener("click", () => void this.handleGenerate());
    this.root.querySelector("#mode-edit-btn")?.addEventListener("click", () => void this.setViewMode("edit"));
    this.root.querySelector("#mode-preview-btn")?.addEventListener("click", () => void this.setViewMode("preview"));
    this.root.querySelector("#create-btn")?.addEventListener("click", () => this.handleCreateFile());

    this.bindExtraPreviewControls();
    this.applyViewMode();
  }

  private async handleGenerate(): Promise<void> {
    const descriptionInput = this.root.querySelector<HTMLTextAreaElement>("#description");
    const generateBtn = this.root.querySelector<HTMLButtonElement>("#generate-btn");
    const resultBox = this.root.querySelector<HTMLElement>("#result");
    if (!descriptionInput || !generateBtn || !resultBox) {
      return;
    }
    const description = descriptionInput.value.trim();
    if (!description || !this.#generate) {
      return;
    }
    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.showStatus("Generating…");
    try {
      const doc = await this.#generate(description);
      this.#doc = doc;
      this.#viewMode = "edit";
      const sourceEl = this.root.querySelector<HTMLTextAreaElement>("#source");
      if (sourceEl) {
        sourceEl.value = doc;
      }
      this.onDocChanged();
      resultBox.hidden = false;
      this.applyViewMode();
      this.hideStatus();
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  protected applyViewMode(): void {
    const sourceEl = this.root.querySelector<HTMLTextAreaElement>("#source");
    const previewAreaEl = this.root.querySelector<HTMLElement>("#preview-area");
    const editBtn = this.root.querySelector<HTMLButtonElement>("#mode-edit-btn");
    const previewBtn = this.root.querySelector<HTMLButtonElement>("#mode-preview-btn");
    if (!sourceEl || !previewAreaEl || !editBtn || !previewBtn) {
      return;
    }
    const isPreview = this.#viewMode === "preview";
    sourceEl.hidden = isPreview;
    previewAreaEl.hidden = !isPreview;
    editBtn.classList.toggle("active", !isPreview);
    previewBtn.classList.toggle("active", isPreview);
  }

  private async setViewMode(mode: "edit" | "preview"): Promise<void> {
    if (mode === "edit") {
      this.#viewMode = "edit";
      this.applyViewMode();
      return;
    }
    const sourceEl = this.root.querySelector<HTMLTextAreaElement>("#source");
    if (!sourceEl) {
      return;
    }
    this.#doc = sourceEl.value;
    this.onDocChanged();
    this.#viewMode = "preview";
    this.applyViewMode();
    await this.renderPreview();
  }

  protected async renderPreview(): Promise<void> {
    const previewEl = this.root.querySelector<HTMLElement>(".preview");
    if (previewEl) {
      previewEl.innerHTML = `<p class="rendering-status">Rendering…</p>`;
    }
    // The user may switch back to Edit, or regenerate an entirely new
    // doc, while this async render (real Mermaid rendering can take
    // real time) is still in flight - a token guard, not just a
    // viewMode check, since navigating away and back could
    // coincidentally leave viewMode as "preview" again for a DIFFERENT
    // doc by the time this resolves.
    const token = ++this.#renderToken;
    const html = await renderMarkdownToHtml(this.currentPreviewSource());
    if (token !== this.#renderToken) {
      return;
    }
    const currentPreviewEl = this.root.querySelector<HTMLElement>(".preview");
    if (this.#viewMode === "preview" && currentPreviewEl) {
      currentPreviewEl.innerHTML = html;
    }
    this.afterPreviewRendered();
  }

  private handleCreateFile(): void {
    const pathInput = this.root.querySelector<HTMLInputElement>("#file-path");
    const sourceEl = this.root.querySelector<HTMLTextAreaElement>("#source");
    const errorEl = this.root.querySelector<HTMLElement>("#create-error");
    if (!pathInput || !sourceEl || !errorEl || !this.#createFile) {
      return;
    }
    const result = this.#createFile(pathInput.value, sourceEl.value);
    if (!result.ok) {
      errorEl.hidden = false;
      errorEl.textContent = result.error ?? "Couldn't create the file.";
      return;
    }
    errorEl.hidden = true;
  }

  protected showStatus(text: string): void {
    const el = this.root.querySelector<StatusLineView>("#status");
    if (el) {
      el.text = text;
    }
  }

  protected hideStatus(): void {
    this.showStatus("");
  }
}

export class DesignGeneratorControl extends DocGeneratorControl {
  constructor() {
    super({
      icon: "🎨",
      heading: "Generate",
      backLabel: "Design",
      descriptionLabel: "Describe what to design",
      descriptionPlaceholder: "e.g. the auth flow for this app",
      defaultFilePath: "design.md",
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-design-generator")) {
  customElements.define("control-design-generator", DesignGeneratorControl);
}
