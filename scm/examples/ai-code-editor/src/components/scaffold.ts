import type { FeatureStore } from "@justjs/data";
import type { ImageAttachment, ScaffoldedFile } from "@justjs/ai-assist";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo } from "../core/navigation.js";
import { inferLanguage, normalizePath, pathExists } from "../core/fs.js";
import type { FileMap } from "../core/fs.js";
import { isSupportedImageType, MAX_IMAGE_BYTES, MAX_IMAGE_MB, parseDataUrl, readImageFileAsDataUrl } from "../core/images.js";
import { describeVoiceError, isVoicePromptSupported, startVoicePrompt } from "../core/speech.js";
import type { VoicePromptHandle } from "../core/speech.js";
import "@justjs/component-view";
import type { ToggleView } from "@justjs/component-view";
import { ScaffoldBase } from "../features/scaffold/scaffold_component.gen.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

type ScaffoldMode = "file" | "project";

// Two modes: "New File" generates one file's content (existing single-
// file flow, now requiring a path since there's no longer one implicit
// buffer) and "New Project" (new) generates a whole small multi-file
// project via AiAssistProvider.scaffoldProject() - the same structured
// tool-use mechanism review() already proved out. Both require an
// explicit tap to actually apply the result ("Create file" / "Replace
// project") - generating never silently mutates anything on its own,
// which is also why voice input here never auto-triggers Generate the
// way Chat's mic auto-submits (Chat's send is cheap; this isn't).
// Real vision input (a screenshot Claude actually analyzes, e.g. "build
// this from this mockup") is New-Project-only, per the locked scope -
// New File doesn't get an attach control.
//
// Extends ScaffoldBase (justweb-generated, justjs#118, part of
// justjs#113's epic) - see justjs#113's shared note for why
// customElement.tagName is deliberately not set (ScaffoldBase
// self-registers under its harmless default js-scaffold; ScaffoldElement
// keeps its own explicit x-scaffold registration). The 2 mic buttons
// stay plain querySelector calls inside setupVoiceButton() -
// conditionally rendered (voiceSupported), so declaring them would
// permanently break _hasAllElements() on a voice-unsupported device.
export class ScaffoldElement extends ScaffoldBase {
  private store?: FeatureStore<AppState, AppAction>;
  private generatedFileCode = "";
  private generatedProjectFiles: ScaffoldedFile[] = [];
  private voiceHandle: VoicePromptHandle | null = null;
  private pendingProjectImage: ImageAttachment | null = null;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.store = ctx?.store;
  }

  connectedCallback(): void {
    const voiceSupported = isVoicePromptSupported();
    const micButton = (id: string) =>
      voiceSupported ? `<button id="${id}" type="button" class="field-mic-btn" aria-label="Hold to speak">🎤</button>` : "";
    this.innerHTML = `
      <view-toggle id="scaffold-mode-toggle" data-part="mode-toggle"></view-toggle>

      <div id="scaffold-file-mode" class="scaffold-form" data-part="file-mode">
        <label class="field">
          <span class="field-label">Describe the file to generate</span>
          <div class="field-with-mic">
            <textarea id="scaffold-description" data-part="description" rows="4" placeholder="e.g. a debounce utility function"></textarea>
            ${micButton("scaffold-description-mic-btn")}
          </div>
        </label>
        <label class="field">
          <span class="field-label">Path</span>
          <input id="scaffold-file-path" data-part="file-path" type="text" placeholder="src/utils/debounce.js" autocomplete="off" spellcheck="false" />
        </label>
        <button id="scaffold-generate-btn" data-part="generate-btn" type="button">Generate</button>
      </div>

      <div id="scaffold-project-mode" class="scaffold-form" data-part="project-mode" hidden>
        <label class="field">
          <span class="field-label">Describe the project to generate</span>
          <div class="field-with-mic">
            <textarea id="scaffold-project-description" data-part="project-description" rows="4" placeholder="e.g. a small CLI that reverses a string"></textarea>
            ${micButton("scaffold-project-description-mic-btn")}
          </div>
        </label>
        <div class="scaffold-image-row">
          <input id="scaffold-project-image-input" data-part="project-image-input" type="file" accept="image/*" hidden />
          <button id="scaffold-project-image-btn" type="button" class="btn-secondary">📷 Attach screenshot</button>
        </div>
        <div id="scaffold-project-image-preview" class="attach-image-preview" data-part="project-image-preview" hidden>
          <img id="scaffold-project-image-thumb" data-part="project-image-thumb" alt="Attached screenshot" />
          <span class="attach-image-label">Screenshot attached</span>
          <button id="scaffold-project-image-remove" type="button" class="btn-secondary">Remove</button>
        </div>
        <p id="scaffold-project-image-error" class="attach-image-error" data-part="project-image-error" hidden></p>
        <button id="scaffold-generate-project-btn" data-part="generate-project-btn" type="button">Generate project</button>
      </div>

      <p id="scaffold-status" class="editor-status" data-part="status" hidden></p>

      <div id="scaffold-result" class="scaffold-result" data-part="result" hidden>
        <pre id="scaffold-code" data-part="code"></pre>
        <button id="scaffold-insert-btn" type="button">Create file</button>
      </div>

      <div id="scaffold-project-result" class="scaffold-project-result" data-part="project-result" hidden>
        <div id="scaffold-project-files" class="scaffold-project-files" data-part="project-files"></div>
        <button id="scaffold-replace-btn" type="button">Replace project</button>
        <div id="scaffold-replace-confirm" class="scaffold-replace-confirm" data-part="replace-confirm" hidden>
          <p id="scaffold-replace-message" data-part="replace-message"></p>
          <div class="scaffold-replace-actions">
            <button id="scaffold-replace-confirm-btn" type="button">Confirm</button>
            <button id="scaffold-replace-cancel-btn" type="button" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    `;
    // Binds this.modeToggle/this.description/etc via real data-part
    // lookups - must run after the markup above exists, since
    // ScaffoldBase's own connectedCallback() calls _bindElements()
    // synchronously.
    super.connectedCallback();

    const modeToggle = this.modeToggle as ToggleView;
    modeToggle.options = [
      { value: "file", label: "New File" },
      { value: "project", label: "New Project" },
    ];
    modeToggle.activeValue = "file";
    modeToggle.addEventListener("change", (e) => {
      this.setMode((e as CustomEvent<{ value: ScaffoldMode }>).detail.value);
    });
    this.generateBtn.addEventListener("click", () => void this.handleGenerateFile());
    this.querySelector("#scaffold-insert-btn")?.addEventListener("click", () => this.handleCreateFile());
    this.generateProjectBtn.addEventListener("click", () => void this.handleGenerateProject());
    this.querySelector("#scaffold-replace-btn")?.addEventListener("click", () => this.startReplaceConfirm());
    this.querySelector("#scaffold-replace-confirm-btn")?.addEventListener("click", () => this.confirmReplace());
    this.querySelector("#scaffold-replace-cancel-btn")?.addEventListener("click", () => this.cancelReplaceConfirm());

    if (voiceSupported) {
      this.setupVoiceButton("scaffold-description-mic-btn", "scaffold-description");
      this.setupVoiceButton("scaffold-project-description-mic-btn", "scaffold-project-description");
    }

    this.querySelector("#scaffold-project-image-btn")?.addEventListener("click", () => this.projectImageInput.click());
    this.projectImageInput.addEventListener("change", () => void this.handleImageSelected(this.projectImageInput));
    this.querySelector("#scaffold-project-image-remove")?.addEventListener("click", () => this.clearPendingImage());
  }

  disconnectedCallback(): void {
    this.voiceHandle?.stop();
  }

  private setupVoiceButton(micBtnId: string, textareaId: string): void {
    const micBtn = this.querySelector<HTMLButtonElement>(`#${micBtnId}`);
    const textarea = this.querySelector<HTMLTextAreaElement>(`#${textareaId}`);
    if (!micBtn || !textarea) {
      return;
    }
    micBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.startHold(micBtn, textarea);
    });
    micBtn.addEventListener("pointerup", () => this.endHold());
    micBtn.addEventListener("pointercancel", () => this.endHold());
    micBtn.addEventListener("pointerleave", () => this.endHold());
  }

  private startHold(micBtn: HTMLButtonElement, textarea: HTMLTextAreaElement): void {
    if (this.voiceHandle) {
      return;
    }
    textarea.value = "";
    micBtn.classList.add("listening");
    micBtn.textContent = "⏺️";

    this.voiceHandle = startVoicePrompt({
      onTranscript: ({ transcript }) => {
        textarea.value = transcript;
      },
      onEnd: () => {
        this.voiceHandle = null;
        micBtn.classList.remove("listening");
        micBtn.textContent = "🎤";
        // No auto-Generate here, unlike Chat's mic - Generate is an
        // explicit, sometimes-costly action; the transcript just lands
        // in the textarea for the user to review or edit first.
      },
      onError: (code) => {
        this.voiceHandle = null;
        micBtn.classList.remove("listening");
        micBtn.textContent = "🎤";
        if (code === "aborted") {
          return;
        }
        this.showStatus(`⚠️ ${describeVoiceError(code)}`);
      },
    });
  }

  private endHold(): void {
    this.voiceHandle?.stop();
  }

  private async handleImageSelected(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    if (!isSupportedImageType(file.type)) {
      this.showImageError("Unsupported image type - use PNG, JPEG, WebP, or GIF.");
      input.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.showImageError(`Image too large (max ${MAX_IMAGE_MB}MB).`);
      input.value = "";
      return;
    }
    const dataUrl = await readImageFileAsDataUrl(file);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      this.showImageError("Couldn't read that image - try a different file.");
      input.value = "";
      return;
    }
    this.hideImageError();
    this.pendingProjectImage = parsed;
    this.projectImageThumb.src = dataUrl;
    this.projectImagePreview.hidden = false;
  }

  private clearPendingImage(): void {
    this.pendingProjectImage = null;
    this.projectImageInput.value = "";
    this.projectImagePreview.hidden = true;
    this.hideImageError();
  }

  private showImageError(text: string): void {
    this.projectImageError.hidden = false;
    this.projectImageError.textContent = text;
  }

  private hideImageError(): void {
    this.projectImageError.hidden = true;
  }

  private setMode(mode: ScaffoldMode): void {
    (this.modeToggle as ToggleView).activeValue = mode;
    this.fileMode.hidden = mode !== "file";
    this.projectMode.hidden = mode !== "project";
    this.hideStatus();
  }

  private async handleGenerateFile(): Promise<void> {
    const { description: descriptionInput, filePath: pathInput, generateBtn, result: resultBox } = this;
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }

    const provider = getAiAssistProvider();
    if (!provider) {
      this.showStatus("⚠️ Add an Anthropic API key in Settings to generate code.");
      return;
    }

    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.showStatus("Generating…");
    try {
      const path = normalizePath(pathInput.value);
      const language = path ? inferLanguage(path) : undefined;
      const code = await provider.scaffold({ description, ...(language !== undefined ? { language } : {}) });
      this.generatedFileCode = code;
      this.code.textContent = code;
      resultBox.hidden = false;
      this.hideStatus();
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  private handleCreateFile(): void {
    if (!this.store || !this.generatedFileCode) {
      return;
    }
    const path = normalizePath(this.filePath.value ?? "");
    if (!path) {
      this.showStatus("⚠️ Enter a path before creating the file.");
      return;
    }
    const state = this.store.state.value;
    if (pathExists(state.files, state.emptyFolders, path)) {
      this.showStatus(`⚠️ "${path}" already exists - choose a different path.`);
      return;
    }
    this.store.dispatch({ type: "CREATE_FILE", path, content: this.generatedFileCode, language: inferLanguage(path) });
    navigateTo("/editor");
  }

  private async handleGenerateProject(): Promise<void> {
    const { projectDescription: descriptionInput, generateProjectBtn: generateBtn, projectResult: resultBox } = this;
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }

    const image = this.pendingProjectImage;
    this.clearPendingImage();
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showStatus("⚠️ Add an Anthropic API key in Settings to generate a project.");
      return;
    }

    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.cancelReplaceConfirm();
    // A materially longer blocking wait than single-file generation -
    // no streaming path exists anywhere in this codebase's network
    // layer, so this really is one uninterrupted wait, not a stuck UI.
    this.showStatus("Generating project… this can take up to a minute");
    try {
      const files = await provider.scaffoldProject({ description, ...(image !== null ? { image } : {}) });
      this.generatedProjectFiles = files;
      this.renderProjectPreview();
      resultBox.hidden = false;
      this.hideStatus();
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  private renderProjectPreview(): void {
    const container = this.projectFiles;
    container.innerHTML = this.generatedProjectFiles
      .map((f, i) => {
        const lineCount = f.content.split("\n").length;
        return `
          <div class="scaffold-project-file">
            <button type="button" class="scaffold-project-file-toggle" data-index="${i}">
              📄 ${escapeHtml(f.path)} <span class="scaffold-project-file-meta">${lineCount} lines</span>
            </button>
            <pre class="scaffold-project-file-content" hidden>${escapeHtml(f.content)}</pre>
          </div>
        `;
      })
      .join("");
    container.querySelectorAll<HTMLButtonElement>(".scaffold-project-file-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const pre = btn.nextElementSibling as HTMLElement | null;
        if (pre) {
          pre.hidden = !pre.hidden;
        }
      });
    });
  }

  private startReplaceConfirm(): void {
    if (!this.store || this.generatedProjectFiles.length === 0) {
      return;
    }
    const existingCount = Object.keys(this.store.state.value.files).length;
    const message =
      existingCount > 0
        ? `Replace your current project? ${existingCount} existing file${existingCount === 1 ? "" : "s"} will be removed.`
        : "Create this project?";
    this.replaceMessage.textContent = message;
    this.replaceConfirm.hidden = false;
  }

  private cancelReplaceConfirm(): void {
    this.replaceConfirm.hidden = true;
  }

  private confirmReplace(): void {
    if (!this.store || this.generatedProjectFiles.length === 0) {
      return;
    }
    const files: FileMap = {};
    for (const f of this.generatedProjectFiles) {
      files[f.path] = { content: f.content, language: inferLanguage(f.path) };
    }
    const activeFilePath = this.generatedProjectFiles[0]?.path ?? null;
    this.store.dispatch({ type: "REPLACE_PROJECT", files, emptyFolders: [], activeFilePath });
    this.cancelReplaceConfirm();
    this.projectResult.hidden = true;
    this.generatedProjectFiles = [];
    navigateTo("/editor");
  }

  private showStatus(text: string): void {
    this.status.hidden = false;
    this.status.textContent = text;
  }

  private hideStatus(): void {
    this.status.hidden = true;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-scaffold")) {
  customElements.define("x-scaffold", ScaffoldElement);
}
