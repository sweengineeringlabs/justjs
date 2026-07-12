import type { FeatureStore } from "@justjs/data";
import type { ScaffoldedFile } from "@justjs/ai-assist";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo } from "../core/navigation.js";
import { inferLanguage, normalizePath, pathExists } from "../core/fs.js";
import type { FileMap } from "../core/fs.js";

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
// project") - generating never silently mutates anything on its own.
export class ScaffoldElement extends HTMLElement {
  private store?: FeatureStore<AppState, AppAction>;
  private generatedFileCode = "";
  private generatedProjectFiles: ScaffoldedFile[] = [];

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.store = ctx?.store;
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div class="scaffold-mode-toggle">
        <button id="scaffold-mode-file-btn" type="button" class="scaffold-mode-btn active">New File</button>
        <button id="scaffold-mode-project-btn" type="button" class="scaffold-mode-btn">New Project</button>
      </div>

      <div id="scaffold-file-mode" class="scaffold-form">
        <label class="field">
          <span class="field-label">Describe the file to generate</span>
          <textarea id="scaffold-description" rows="4" placeholder="e.g. a debounce utility function"></textarea>
        </label>
        <label class="field">
          <span class="field-label">Path</span>
          <input id="scaffold-file-path" type="text" placeholder="src/utils/debounce.js" autocomplete="off" spellcheck="false" />
        </label>
        <button id="scaffold-generate-btn" type="button">Generate</button>
      </div>

      <div id="scaffold-project-mode" class="scaffold-form" hidden>
        <label class="field">
          <span class="field-label">Describe the project to generate</span>
          <textarea id="scaffold-project-description" rows="4" placeholder="e.g. a small CLI that reverses a string"></textarea>
        </label>
        <button id="scaffold-generate-project-btn" type="button">Generate project</button>
      </div>

      <p id="scaffold-status" class="editor-status" hidden></p>

      <div id="scaffold-result" class="scaffold-result" hidden>
        <pre id="scaffold-code"></pre>
        <button id="scaffold-insert-btn" type="button">Create file</button>
      </div>

      <div id="scaffold-project-result" class="scaffold-project-result" hidden>
        <div id="scaffold-project-files" class="scaffold-project-files"></div>
        <button id="scaffold-replace-btn" type="button">Replace project</button>
        <div id="scaffold-replace-confirm" class="scaffold-replace-confirm" hidden>
          <p id="scaffold-replace-message"></p>
          <div class="scaffold-replace-actions">
            <button id="scaffold-replace-confirm-btn" type="button">Confirm</button>
            <button id="scaffold-replace-cancel-btn" type="button" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    `;

    this.querySelector("#scaffold-mode-file-btn")?.addEventListener("click", () => this.setMode("file"));
    this.querySelector("#scaffold-mode-project-btn")?.addEventListener("click", () => this.setMode("project"));
    this.querySelector("#scaffold-generate-btn")?.addEventListener("click", () => void this.handleGenerateFile());
    this.querySelector("#scaffold-insert-btn")?.addEventListener("click", () => this.handleCreateFile());
    this.querySelector("#scaffold-generate-project-btn")?.addEventListener("click", () => void this.handleGenerateProject());
    this.querySelector("#scaffold-replace-btn")?.addEventListener("click", () => this.startReplaceConfirm());
    this.querySelector("#scaffold-replace-confirm-btn")?.addEventListener("click", () => this.confirmReplace());
    this.querySelector("#scaffold-replace-cancel-btn")?.addEventListener("click", () => this.cancelReplaceConfirm());
  }

  private setMode(mode: ScaffoldMode): void {
    this.querySelector("#scaffold-mode-file-btn")?.classList.toggle("active", mode === "file");
    this.querySelector("#scaffold-mode-project-btn")?.classList.toggle("active", mode === "project");
    const fileModeEl = this.querySelector<HTMLElement>("#scaffold-file-mode");
    const projectModeEl = this.querySelector<HTMLElement>("#scaffold-project-mode");
    if (fileModeEl) {
      fileModeEl.hidden = mode !== "file";
    }
    if (projectModeEl) {
      projectModeEl.hidden = mode !== "project";
    }
    this.hideStatus();
  }

  private async handleGenerateFile(): Promise<void> {
    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#scaffold-description");
    const pathInput = this.querySelector<HTMLInputElement>("#scaffold-file-path");
    const generateBtn = this.querySelector<HTMLButtonElement>("#scaffold-generate-btn");
    const resultBox = this.querySelector<HTMLElement>("#scaffold-result");
    if (!descriptionInput || !pathInput || !generateBtn || !resultBox) {
      return;
    }
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
      const codeEl = this.querySelector("#scaffold-code");
      if (codeEl) {
        codeEl.textContent = code;
      }
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
    const pathInput = this.querySelector<HTMLInputElement>("#scaffold-file-path");
    const path = normalizePath(pathInput?.value ?? "");
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
    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#scaffold-project-description");
    const generateBtn = this.querySelector<HTMLButtonElement>("#scaffold-generate-project-btn");
    const resultBox = this.querySelector<HTMLElement>("#scaffold-project-result");
    if (!descriptionInput || !generateBtn || !resultBox) {
      return;
    }
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }

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
      const files = await provider.scaffoldProject({ description });
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
    const container = this.querySelector("#scaffold-project-files");
    if (!container) {
      return;
    }
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
    const messageEl = this.querySelector("#scaffold-replace-message");
    if (messageEl) {
      messageEl.textContent = message;
    }
    const confirmEl = this.querySelector<HTMLElement>("#scaffold-replace-confirm");
    if (confirmEl) {
      confirmEl.hidden = false;
    }
  }

  private cancelReplaceConfirm(): void {
    const confirmEl = this.querySelector<HTMLElement>("#scaffold-replace-confirm");
    if (confirmEl) {
      confirmEl.hidden = true;
    }
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
    const projectResultEl = this.querySelector<HTMLElement>("#scaffold-project-result");
    if (projectResultEl) {
      projectResultEl.hidden = true;
    }
    this.generatedProjectFiles = [];
    navigateTo("/editor");
  }

  private showStatus(text: string): void {
    const status = this.querySelector<HTMLElement>("#scaffold-status");
    if (!status) {
      return;
    }
    status.hidden = false;
    status.textContent = text;
  }

  private hideStatus(): void {
    const status = this.querySelector<HTMLElement>("#scaffold-status");
    if (!status) {
      return;
    }
    status.hidden = true;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-scaffold")) {
  customElements.define("x-scaffold", ScaffoldElement);
}
