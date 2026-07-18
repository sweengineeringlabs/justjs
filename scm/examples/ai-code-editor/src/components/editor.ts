import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { highlight } from "../core/highlight.js";
import { navigateTo, JUMP_LINE_EVENT } from "../core/navigation.js";
import type { JumpLineEventDetail } from "../core/navigation.js";
import {
  buildTree,
  collectFolderPaths,
  inferLanguage,
  isDescendantOrSelf,
  normalizePath,
  parentPath,
  pathExists,
  renamedPath,
} from "../core/fs.js";
import type { TreeNode } from "../core/fs.js";
import "@justjs/component-view";
import type { StatusLineView } from "@justjs/component-view";
import { EditorBase } from "../features/editor/editor_component.gen.js";

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "java", label: "Java" },
  { value: "text", label: "Plain Text" },
];

// Matches --editor-line-height in app.css - kept in sync manually since
// scrollToLine() needs the same value in JS to compute a target
// scrollTop, and there's no live way to read a CSS custom property back
// into a plain number without a getComputedStyle round trip this app
// doesn't otherwise need.
const LINE_HEIGHT_PX = 20;
const INDENT_PX = 14;
const BASE_PADDING_PX = 8;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

interface CreateTarget {
  readonly parentPath: string | null;
  readonly kind: "file" | "folder";
}

interface PendingInputState {
  readonly id: string;
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
}

// The code buffer (a <textarea> laid over a regex-highlighted <pre>, see
// core/highlight.ts, with a synced line-number gutter) plus a file-
// explorer sidebar for the virtual multi-file project (core/fs.ts,
// core/state.ts). Completions are button-triggered ("✨ Suggest"), not
// live-as-you-type ghost text - @justjs/network's FetchAdapter has no
// streaming support anywhere in this codebase, so live-as-you-type would
// mean a blocking API call on every pause in typing.
//
// Extends EditorBase (justweb-generated, justjs#115, part of justjs#113's
// epic) - the 11 elements genuinely re-queried across multiple methods
// (not the 3 one-shot sidebar toolbar buttons, each wired once and never
// read again) are real, generated, typed bindings now
// (this.textarea/this.languageSelect/etc, most auto-typed to their real
// native element type - HTMLTextAreaElement, HTMLSelectElement,
// HTMLButtonElement, etc, better than the hand-written
// querySelector<T>() casts they replace) instead of ~15 separate
// re-query call sites across syncFromStore/renderOverlay/syncScroll/
// scrollToLine/handleSuggest/handleReview/showStatus/hideStatus. Every
// element keeps its original id/class too (app.css and verify_web.mjs
// both depend on them) - data-part is additive, not a replacement.
export class EditorElement extends EditorBase {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;

  // Sidebar UI state - all ephemeral, none of it read by any other
  // component, so it lives here rather than in the FeatureStore (avoids
  // Set-in-a-plain-JSON-reducer serialization questions entirely).
  private sidebarOpen = true;
  private readonly expandedFolders = new Set<string>();
  private creatingIn: CreateTarget | null = null;
  private renamingPath: string | null = null;
  private pendingDeletePath: string | null = null;

  private readonly onJumpToLine = (e: Event): void => {
    const detail = (e as CustomEvent<JumpLineEventDetail>).detail;
    if (detail.filePath && detail.filePath !== this.store?.state.value.activeFilePath) {
      this.store?.dispatch({ type: "OPEN_FILE", path: detail.filePath });
    }
    this.scrollToLine(detail.line);
  };

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.syncFromStore();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div class="editor-toolbar">
        <button id="sidebar-toggle-btn" type="button" title="Toggle file explorer">☰</button>
        <select id="editor-language" data-part="language-select"></select>
        <button id="editor-suggest-btn" data-part="suggest-btn" type="button" class="btn-primary">Suggest</button>
        <button id="editor-review-btn" data-part="review-btn" type="button">Review</button>
      </div>
      <div class="editor-surface" data-part="surface">
        <div class="editor-sidebar">
          <div class="sidebar-toolbar">
            <span class="sidebar-title">Files</span>
            <button id="sidebar-new-file-btn" type="button" title="New file">📄+</button>
            <button id="sidebar-new-folder-btn" type="button" title="New folder">📁+</button>
          </div>
          <div id="sidebar-tree" class="sidebar-tree" data-part="sidebar-tree"></div>
          <p id="sidebar-error" class="sidebar-error" data-part="sidebar-error" hidden></p>
        </div>
        <div id="editor-gutter" class="editor-gutter" data-part="gutter"></div>
        <div class="editor-code-wrap">
          <pre id="editor-highlight" class="editor-highlight" data-part="highlight" aria-hidden="true"><code data-part="highlight-code"></code></pre>
          <textarea id="editor-textarea" class="editor-textarea" data-part="textarea" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
        </div>
      </div>
      <view-status-line id="editor-status" data-part="status"></view-status-line>
    `;
    // Binds this.languageSelect/this.textarea/etc via real data-part
    // lookups - must run after the markup above exists, since
    // EditorBase's own connectedCallback() calls _bindElements()
    // synchronously.
    super.connectedCallback();

    this.languageSelect.innerHTML = LANGUAGES.map((l) => `<option value="${l.value}">${l.label}</option>`).join("");
    this.languageSelect.addEventListener("change", () => {
      this.store?.dispatch({ type: "SET_ACTIVE_FILE_LANGUAGE", language: this.languageSelect.value });
    });

    this.textarea.addEventListener("input", () => {
      this.store?.dispatch({ type: "SET_ACTIVE_FILE_CONTENT", content: this.textarea.value });
      this.renderOverlay();
    });
    this.textarea.addEventListener("scroll", () => this.syncScroll());
    this.textarea.addEventListener("keydown", (e) => this.handleKeydown(e));

    this.suggestBtn.addEventListener("click", () => void this.handleSuggest());
    this.reviewBtn.addEventListener("click", () => void this.handleReview());
    this.querySelector("#sidebar-toggle-btn")?.addEventListener("click", () => {
      this.sidebarOpen = !this.sidebarOpen;
      this.applySidebarOpenState();
    });
    this.querySelector("#sidebar-new-file-btn")?.addEventListener("click", () => this.startCreate(null, "file"));
    this.querySelector("#sidebar-new-folder-btn")?.addEventListener("click", () => this.startCreate(null, "folder"));

    document.addEventListener(JUMP_LINE_EVENT, this.onJumpToLine);

    this.applySidebarOpenState();
    this.syncFromStore();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    document.removeEventListener(JUMP_LINE_EVENT, this.onJumpToLine);
  }

  private applySidebarOpenState(): void {
    this.surface.classList.toggle("sidebar-collapsed", !this.sidebarOpen);
  }

  // A plain <textarea> moves focus on Tab by default, which makes
  // indenting code in this buffer unusable - insert two spaces at the
  // cursor instead, the smallest fix that makes it feel like an editor.
  private handleKeydown(e: KeyboardEvent): void {
    if (e.key !== "Tab") {
      return;
    }
    e.preventDefault();
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = `${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`;
    const cursor = start + 2;
    textarea.setSelectionRange(cursor, cursor);
    this.store?.dispatch({ type: "SET_ACTIVE_FILE_CONTENT", content: textarea.value });
    this.renderOverlay();
  }

  private syncFromStore(): void {
    // dataContext (ADR-0004) can be set on a freshly-constructed element
    // before it's ever appended to the DOM (@justjs/application's own
    // render adapter assigns it ahead of container.replaceChildren() -
    // component_registry_adapter.ts) - meaning this can run before
    // connectedCallback() ever binds this.textarea/etc.
    // connectedCallback() calls this again once real, so no-oping here
    // isn't a missed update, matching the original hand-written
    // querySelector-and-null-check pattern every other tab's own
    // not-yet-migrated dataContext setter still uses. Checking
    // this.isConnected, not this.textarea - EditorBase's bound-element
    // getters now throw if read before _bindElements() has run
    // (justweb#83), so the old `!this.textarea` guard would crash on
    // the exact read it was meant to skip. isConnected is a native Node
    // property, always safe to read, and false for exactly this
    // pre-connectedCallback window.
    if (!this.store || !this.isConnected) {
      return;
    }
    this.renderSidebar();

    const { textarea, languageSelect, suggestBtn, reviewBtn } = this;
    const state = this.store.state.value;
    const activeFile = state.activeFilePath ? state.files[state.activeFilePath] : undefined;
    const hasActiveFile = activeFile !== undefined;
    textarea.disabled = !hasActiveFile;
    suggestBtn.disabled = !hasActiveFile;
    reviewBtn.disabled = !hasActiveFile;
    languageSelect.disabled = !hasActiveFile;
    textarea.placeholder = hasActiveFile ? "" : "No file open — create one in the sidebar.";

    if (!activeFile) {
      if (textarea.value !== "") {
        textarea.value = "";
      }
      this.renderOverlay();
      return;
    }

    if (languageSelect.value !== activeFile.language) {
      languageSelect.value = activeFile.language;
    }
    // Only replace the textarea's value (which resets cursor position)
    // when it genuinely differs from the store - e.g. switching to a
    // different file, or an external write like Scaffold's "Create
    // file". Every keystroke already dispatches SET_ACTIVE_FILE_CONTENT
    // with the textarea's own current value, so this check is what stops
    // this same subscribe callback from clobbering the cursor
    // mid-typing.
    if (textarea.value !== activeFile.content) {
      textarea.value = activeFile.content;
    }
    this.renderOverlay();
  }

  private renderOverlay(): void {
    // A trailing newline keeps the highlight <pre> and the textarea the
    // same height when the buffer ends in \n - without it the <pre>'s
    // last (empty) line collapses and the two surfaces drift out of
    // scroll-sync by one line.
    this.highlightCode.innerHTML = `${highlight(this.textarea.value)}\n`;
    const lineCount = this.textarea.value.split("\n").length;
    const lineNumbers: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      lineNumbers.push(String(i));
    }
    this.gutter.innerHTML = lineNumbers.map((n) => `<div class="editor-gutter-line">${n}</div>`).join("");
    this.syncScroll();
  }

  private syncScroll(): void {
    this.highlight.scrollTop = this.textarea.scrollTop;
    this.highlight.scrollLeft = this.textarea.scrollLeft;
    this.gutter.scrollTop = this.textarea.scrollTop;
  }

  private scrollToLine(line: number): void {
    const textarea = this.textarea;
    const lines = textarea.value.split("\n");
    const clampedLine = Math.min(Math.max(line, 1), lines.length);
    const lineIndex = clampedLine - 1;
    let charIndex = 0;
    for (let i = 0; i < lineIndex; i++) {
      const lineLength = lines[i]!.length;
      charIndex += lineLength + 1;
    }
    const lineText = lines[lineIndex] ?? "";
    textarea.focus();
    textarea.setSelectionRange(charIndex, charIndex + lineText.length);
    // Named intermediates, not inline parenthesized groups next to an
    // operator - justc (0.3.5, verified on real hardware in
    // @justjs/memory's own source) has a confirmed bug silently dropping
    // parens in exactly that shape, corrupting evaluation order.
    const halfViewport = textarea.clientHeight / 2;
    const targetOffset = LINE_HEIGHT_PX * lineIndex;
    textarea.scrollTop = Math.max(0, targetOffset - halfViewport);
    this.syncScroll();
  }

  private async handleSuggest(): Promise<void> {
    if (!this.store) {
      return;
    }
    const { textarea, suggestBtn } = this;
    const state = this.store.state.value;
    const activeFilePath = state.activeFilePath;
    const activeFile = activeFilePath ? state.files[activeFilePath] : undefined;
    if (!activeFilePath || !activeFile) {
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showStatus("⚠️ Add an Anthropic API key in Settings to use AI suggestions.");
      return;
    }
    const cursor = textarea.selectionStart;
    const codeBeforeCursor = textarea.value.slice(0, cursor);
    const codeAfterCursor = textarea.value.slice(cursor);

    suggestBtn.disabled = true;
    this.showStatus("Thinking…");
    try {
      const suggestion = await provider.complete({ codeBeforeCursor, codeAfterCursor, language: activeFile.language });
      // The user may have switched to a different file while this call
      // was in flight - applying a stale suggestion to whatever's now
      // active would corrupt the wrong file's content.
      if (this.store.state.value.activeFilePath !== activeFilePath) {
        this.showStatus("Suggestion discarded — you switched files before it finished.");
        return;
      }
      const nextValue = codeBeforeCursor + suggestion + codeAfterCursor;
      textarea.value = nextValue;
      const nextCursor = cursor + suggestion.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
      this.store.dispatch({ type: "SET_ACTIVE_FILE_CONTENT", content: nextValue });
      this.renderOverlay();
      this.hideStatus();
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      suggestBtn.disabled = false;
    }
  }

  private async handleReview(): Promise<void> {
    if (!this.store) {
      return;
    }
    const reviewBtn = this.reviewBtn;
    const state = this.store.state.value;
    const activeFilePath = state.activeFilePath;
    const activeFile = activeFilePath ? state.files[activeFilePath] : undefined;
    if (!activeFilePath || !activeFile) {
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showStatus("⚠️ Add an Anthropic API key in Settings to run a review.");
      return;
    }
    reviewBtn.disabled = true;
    this.showStatus("Reviewing…");
    try {
      const findings = await provider.review({ code: activeFile.content, language: activeFile.language });
      this.store.dispatch({ type: "SET_REVIEW_FINDINGS", findings, reviewedFilePath: activeFilePath });
      this.hideStatus();
      navigateTo("/review");
    } catch (e) {
      this.showStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      reviewBtn.disabled = false;
    }
  }

  private showStatus(text: string): void {
    (this.status as StatusLineView).text = text;
  }

  private hideStatus(): void {
    (this.status as StatusLineView).text = "";
  }

  // ---- File explorer sidebar ----

  private folderHasDescendantFiles(state: AppState, folderPath: string): boolean {
    return Object.keys(state.files).some((path) => isDescendantOrSelf(path, folderPath));
  }

  // Every tab in this app shares one FeatureStore (same reasoning
  // components/chat.ts's own comment documents for agentic-memory-demo)
  // - a dispatch from an unrelated action (e.g. a chat reply landing
  // while the user is mid-typing a new filename) fires this component's
  // subscribe callback too, and a full innerHTML rebuild would otherwise
  // wipe whatever's typed into the create/rename input. Captured before
  // and restored after the rebuild so an in-progress create/rename
  // survives an unrelated store update.
  private renderSidebar(): void {
    if (!this.store) {
      return;
    }
    const container = this.sidebarTree;
    const preserved = this.capturePendingInputState(container);
    const state = this.store.state.value;
    // Reveals the active file in the tree rather than leaving it hidden
    // behind a collapsed ancestor folder - matters most on first load,
    // where the starter tree's active file (src/main.js) would otherwise
    // be open in the editor with no visible indication of where it lives
    // in the sidebar. Set.add is idempotent, so re-running this on every
    // render (whenever the active file hasn't changed) is harmless.
    if (state.activeFilePath) {
      let ancestor = parentPath(state.activeFilePath);
      while (ancestor !== null) {
        this.expandedFolders.add(ancestor);
        ancestor = parentPath(ancestor);
      }
    }
    const tree = buildTree(state.files, state.emptyFolders);
    let html = tree.map((node) => this.renderNode(node, 0, state)).join("");
    if (this.creatingIn && this.creatingIn.parentPath === null) {
      html += this.renderCreateRow(0);
    }
    container.innerHTML = html || `<p class="sidebar-empty">No files yet.</p>`;
    this.wireTreeRowEvents(container);
    this.restorePendingInputState(container, preserved);
  }

  private capturePendingInputState(container: HTMLElement): PendingInputState | null {
    const active = container.querySelector<HTMLInputElement>("#tree-create-input, #tree-rename-input");
    if (!active || document.activeElement !== active) {
      return null;
    }
    return {
      id: active.id,
      value: active.value,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }

  private restorePendingInputState(container: HTMLElement, preserved: PendingInputState | null): void {
    if (!preserved) {
      return;
    }
    const restored = container.querySelector<HTMLInputElement>(`#${preserved.id}`);
    if (!restored) {
      return;
    }
    restored.value = preserved.value;
    restored.focus();
    if (preserved.selectionStart !== null && preserved.selectionEnd !== null) {
      restored.setSelectionRange(preserved.selectionStart, preserved.selectionEnd);
    }
  }

  private renderNode(node: TreeNode, depth: number, state: AppState): string {
    const indent = depth * INDENT_PX;
    const paddingLeft = indent + BASE_PADDING_PX;
    const style = `padding-left:${paddingLeft}px`;

    if (node.type === "file") {
      if (this.renamingPath === node.path) {
        return this.renderRenameRow(node, style);
      }
      if (this.pendingDeletePath === node.path) {
        return this.renderDeleteConfirmRow(node, style, false);
      }
      const activeClass = node.path === state.activeFilePath ? " active" : "";
      return `
        <div class="tree-row tree-file${activeClass}" data-path="${escapeAttr(node.path)}" data-type="file">
          <span class="tree-row-label" data-action="open" style="${style}">📄 ${escapeHtml(node.name)}</span>
          <span class="tree-row-actions">
            <button type="button" class="tree-icon-btn" data-action="rename" data-path="${escapeAttr(node.path)}" aria-label="Rename">✏️</button>
            <button type="button" class="tree-icon-btn" data-action="delete" data-path="${escapeAttr(node.path)}" aria-label="Delete">🗑️</button>
          </span>
        </div>
      `;
    }

    let html: string;
    if (this.renamingPath === node.path) {
      html = this.renderRenameRow(node, style);
    } else if (this.pendingDeletePath === node.path) {
      html = this.renderDeleteConfirmRow(node, style, this.folderHasDescendantFiles(state, node.path));
    } else {
      const expanded = this.expandedFolders.has(node.path);
      const chevron = expanded ? "▾" : "▸";
      html = `
        <div class="tree-row tree-folder" data-path="${escapeAttr(node.path)}" data-type="folder">
          <span class="tree-row-label" data-action="toggle" style="${style}">${chevron} 📁 ${escapeHtml(node.name)}</span>
          <span class="tree-row-actions">
            <button type="button" class="tree-icon-btn" data-action="new-file" data-path="${escapeAttr(node.path)}" aria-label="New file here">📄+</button>
            <button type="button" class="tree-icon-btn" data-action="new-folder" data-path="${escapeAttr(node.path)}" aria-label="New folder here">📁+</button>
            <button type="button" class="tree-icon-btn" data-action="rename" data-path="${escapeAttr(node.path)}" aria-label="Rename">✏️</button>
            <button type="button" class="tree-icon-btn" data-action="delete" data-path="${escapeAttr(node.path)}" aria-label="Delete">🗑️</button>
          </span>
        </div>
      `;
    }

    if (this.expandedFolders.has(node.path)) {
      const childDepth = depth + 1;
      for (const child of node.children) {
        html += this.renderNode(child, childDepth, state);
      }
      if (this.creatingIn && this.creatingIn.parentPath === node.path) {
        html += this.renderCreateRow(childDepth);
      }
    }
    return html;
  }

  private renderCreateRow(depth: number): string {
    const indent = depth * INDENT_PX;
    const paddingLeft = indent + BASE_PADDING_PX;
    const kind = this.creatingIn?.kind === "folder" ? "folder" : "file";
    const placeholder = kind === "folder" ? "folder-name" : "filename.js";
    return `
      <div class="tree-row tree-create-row" style="padding-left:${paddingLeft}px">
        <input id="tree-create-input" type="text" placeholder="${placeholder}" autocomplete="off" spellcheck="false" />
        <button type="button" class="tree-icon-btn" data-action="commit-create" aria-label="Create">✓</button>
        <button type="button" class="tree-icon-btn" data-action="cancel-create" aria-label="Cancel">✕</button>
      </div>
    `;
  }

  private renderRenameRow(node: TreeNode, style: string): string {
    return `
      <div class="tree-row tree-rename-row">
        <input id="tree-rename-input" type="text" value="${escapeAttr(node.name)}" autocomplete="off" spellcheck="false" style="${style}" />
        <button type="button" class="tree-icon-btn" data-action="commit-rename" data-path="${escapeAttr(node.path)}" aria-label="Save">✓</button>
        <button type="button" class="tree-icon-btn" data-action="cancel-rename" aria-label="Cancel">✕</button>
      </div>
    `;
  }

  private renderDeleteConfirmRow(node: TreeNode, style: string, hasDescendantFiles: boolean): string {
    const message = hasDescendantFiles
      ? `Delete '${node.name}' and everything inside it?`
      : `Delete '${node.name}'?`;
    return `
      <div class="tree-row tree-delete-row" style="${style}">
        <span class="tree-delete-message">${escapeHtml(message)}</span>
        <button type="button" class="tree-icon-btn" data-action="confirm-delete" data-path="${escapeAttr(node.path)}" data-is-folder="${node.type === "folder"}" aria-label="Confirm delete">Confirm</button>
        <button type="button" class="tree-icon-btn" data-action="cancel-delete" aria-label="Cancel">Cancel</button>
      </div>
    `;
  }

  private wireTreeRowEvents(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>('[data-action="open"]').forEach((el) => {
      el.addEventListener("click", () => {
        const path = el.closest<HTMLElement>(".tree-row")?.dataset.path;
        if (path) {
          this.store?.dispatch({ type: "OPEN_FILE", path });
        }
      });
    });
    container.querySelectorAll<HTMLElement>('[data-action="toggle"]').forEach((el) => {
      el.addEventListener("click", () => {
        const path = el.closest<HTMLElement>(".tree-row")?.dataset.path;
        if (!path) {
          return;
        }
        if (this.expandedFolders.has(path)) {
          this.expandedFolders.delete(path);
        } else {
          this.expandedFolders.add(path);
        }
        this.renderSidebar();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="new-file"]').forEach((btn) => {
      btn.addEventListener("click", () => this.startCreate(btn.dataset.path ?? null, "file"));
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="new-folder"]').forEach((btn) => {
      btn.addEventListener("click", () => this.startCreate(btn.dataset.path ?? null, "folder"));
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="rename"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.renamingPath = btn.dataset.path ?? null;
        this.pendingDeletePath = null;
        this.creatingIn = null;
        this.clearSidebarError();
        this.renderSidebar();
        this.querySelector<HTMLInputElement>("#tree-rename-input")?.focus();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.pendingDeletePath = btn.dataset.path ?? null;
        this.renamingPath = null;
        this.creatingIn = null;
        this.clearSidebarError();
        this.renderSidebar();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="confirm-delete"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const path = btn.dataset.path;
        const isFolder = btn.dataset.isFolder === "true";
        if (path) {
          this.store?.dispatch({ type: "DELETE_PATH", path, isFolder });
        }
        this.pendingDeletePath = null;
        this.renderSidebar();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="cancel-delete"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.pendingDeletePath = null;
        this.renderSidebar();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="commit-rename"]').forEach((btn) => {
      btn.addEventListener("click", () => this.commitRename(btn.dataset.path ?? null));
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="cancel-rename"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.renamingPath = null;
        this.renderSidebar();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="commit-create"]').forEach((btn) => {
      btn.addEventListener("click", () => this.commitCreate());
    });
    container.querySelectorAll<HTMLButtonElement>('[data-action="cancel-create"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.creatingIn = null;
        this.renderSidebar();
      });
    });

    const renameInput = container.querySelector<HTMLInputElement>("#tree-rename-input");
    renameInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.commitRename(this.renamingPath);
      } else if (e.key === "Escape") {
        this.renamingPath = null;
        this.renderSidebar();
      }
    });
    renameInput?.focus();

    const createInput = container.querySelector<HTMLInputElement>("#tree-create-input");
    createInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.commitCreate();
      } else if (e.key === "Escape") {
        this.creatingIn = null;
        this.renderSidebar();
      }
    });
    createInput?.focus();
  }

  private startCreate(parentPath: string | null, kind: "file" | "folder"): void {
    this.creatingIn = { parentPath, kind };
    this.renamingPath = null;
    this.pendingDeletePath = null;
    if (parentPath) {
      this.expandedFolders.add(parentPath);
    }
    this.clearSidebarError();
    this.renderSidebar();
  }

  private commitCreate(): void {
    if (!this.creatingIn || !this.store) {
      return;
    }
    const input = this.querySelector<HTMLInputElement>("#tree-create-input");
    const name = normalizePath(input?.value ?? "");
    if (!name || name.includes("/")) {
      this.showSidebarError("Enter a single name, not a path.");
      return;
    }
    const target = this.creatingIn;
    const candidatePath = target.parentPath ? `${target.parentPath}/${name}` : name;
    const state = this.store.state.value;
    if (pathExists(state.files, state.emptyFolders, candidatePath)) {
      this.showSidebarError(`"${candidatePath}" already exists.`);
      return;
    }
    if (target.kind === "folder") {
      this.store.dispatch({ type: "CREATE_FOLDER", path: candidatePath });
    } else {
      this.store.dispatch({
        type: "CREATE_FILE",
        path: candidatePath,
        content: "",
        language: inferLanguage(candidatePath),
      });
    }
    this.creatingIn = null;
    this.renderSidebar();
  }

  private commitRename(path: string | null): void {
    if (!path || !this.store) {
      return;
    }
    const input = this.querySelector<HTMLInputElement>("#tree-rename-input");
    const name = normalizePath(input?.value ?? "");
    if (!name || name.includes("/")) {
      this.showSidebarError("Enter a single name, not a path.");
      return;
    }
    const state = this.store.state.value;
    const parent = parentPath(path);
    const newPath = parent ? `${parent}/${name}` : name;
    if (newPath === path) {
      this.renamingPath = null;
      this.renderSidebar();
      return;
    }
    const isFolder = !state.files[path];

    if (isFolder) {
      // Every descendant's prefix gets rewritten too - check the whole
      // renamed set doesn't collide with anything outside it, not just
      // the folder's own new path.
      const renameSet = new Map<string, string>();
      for (const filePath of Object.keys(state.files)) {
        if (isDescendantOrSelf(filePath, path)) {
          renameSet.set(filePath, renamedPath(filePath, path, newPath));
        }
      }
      for (const folderPath of collectFolderPaths(state.files, state.emptyFolders)) {
        if (isDescendantOrSelf(folderPath, path)) {
          renameSet.set(folderPath, renamedPath(folderPath, path, newPath));
        }
      }
      const collidingPath = [...renameSet.values()].find(
        (candidate) => pathExists(state.files, state.emptyFolders, candidate) && !renameSet.has(candidate)
      );
      if (collidingPath) {
        this.showSidebarError(`"${collidingPath}" already exists.`);
        return;
      }
    } else if (pathExists(state.files, state.emptyFolders, newPath)) {
      this.showSidebarError(`"${newPath}" already exists.`);
      return;
    }

    this.store.dispatch({ type: "RENAME_PATH", oldPath: path, newPath, isFolder });
    if (isFolder && this.expandedFolders.has(path)) {
      this.expandedFolders.delete(path);
      this.expandedFolders.add(newPath);
    }
    this.renamingPath = null;
    this.renderSidebar();
  }

  private showSidebarError(message: string): void {
    this.sidebarError.hidden = false;
    this.sidebarError.textContent = message;
  }

  private clearSidebarError(): void {
    this.sidebarError.hidden = true;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-editor")) {
  customElements.define("x-editor", EditorElement);
}
