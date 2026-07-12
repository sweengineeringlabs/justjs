import type { FeatureStore } from "@justjs/data";
import type { ImageAttachment } from "@justjs/ai-assist";
import type { AppState, AppAction, ChatUiMessage } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { isSupportedImageType, MAX_IMAGE_BYTES, MAX_IMAGE_MB, parseDataUrl, readImageFileAsDataUrl } from "../core/images.js";
import { describeVoiceError, isVoicePromptSupported, startVoicePrompt } from "../core/speech.js";
import type { VoicePromptHandle } from "../core/speech.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The AI chat surface: each user turn sends the full conversation plus
// the active file's content as context to AiAssistProvider.chat(). No
// streaming - @justjs/network's FetchAdapter fully buffers the response,
// so a reply appears all at once after one blocking wait, not
// token-by-token. Voice (press-and-hold mic, auto-submits on release -
// sending a chat message is a cheap, no-cost action, unlike Scaffold's
// Generate) and a real vision attachment (Claude actually sees the
// screenshot, not just local display) are both new on top of the
// original text-only version of this component.
export class ChatElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;
  private voiceHandle: VoicePromptHandle | null = null;
  private pendingImage: ImageAttachment | null = null;
  private pendingImageDataUrl: string | null = null;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderMessages();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    const voiceSupported = isVoicePromptSupported();
    this.innerHTML = `
      <div id="chat-messages"></div>
      <p id="chat-context-label" class="chat-context-label"></p>
      <div id="chat-image-preview" class="attach-image-preview" hidden>
        <img id="chat-image-thumb" alt="Attached screenshot" />
        <span class="attach-image-label">Screenshot attached</span>
        <button id="chat-image-remove" type="button" class="btn-secondary">Remove</button>
      </div>
      <p id="chat-image-error" class="attach-image-error" hidden></p>
      <form id="chat-form">
        <input id="chat-input" type="text" placeholder="Ask about your code..." autocomplete="off" />
        <input id="chat-image-input" type="file" accept="image/*" hidden />
        <button id="chat-image-btn" type="button" aria-label="Attach screenshot">📷</button>
        ${voiceSupported ? `<button id="chat-mic-btn" type="button" aria-label="Hold to speak">🎤</button>` : ""}
        <button type="submit">Send</button>
      </form>
    `;
    this.querySelector("#chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSubmit();
    });

    const imageInput = this.querySelector<HTMLInputElement>("#chat-image-input")!;
    this.querySelector("#chat-image-btn")?.addEventListener("click", () => imageInput.click());
    imageInput.addEventListener("change", () => void this.handleImageSelected(imageInput));
    this.querySelector("#chat-image-remove")?.addEventListener("click", () => this.clearPendingImage());

    if (voiceSupported) {
      this.setupVoicePrompt();
    }
    this.renderMessages();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.voiceHandle?.stop();
  }

  private setupVoicePrompt(): void {
    const micBtn = this.querySelector<HTMLButtonElement>("#chat-mic-btn")!;
    // Press-and-hold, not tap-to-toggle - matches a real voice-message
    // gesture. preventDefault on pointerdown stops mobile's text-
    // selection/long-press-context-menu gesture from firing on the same
    // press (same pattern agentic-memory-demo/src/components/chat.ts
    // established).
    micBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.startHold();
    });
    micBtn.addEventListener("pointerup", () => this.endHold());
    micBtn.addEventListener("pointercancel", () => this.endHold());
    micBtn.addEventListener("pointerleave", () => this.endHold());
  }

  private startHold(): void {
    if (this.voiceHandle) {
      return;
    }
    const input = this.querySelector<HTMLInputElement>("#chat-input")!;
    const micBtn = this.querySelector<HTMLButtonElement>("#chat-mic-btn")!;
    input.value = "";
    micBtn.classList.add("listening");
    micBtn.textContent = "⏺️";

    this.voiceHandle = startVoicePrompt({
      onTranscript: ({ transcript }) => {
        input.value = transcript;
      },
      onEnd: () => {
        this.voiceHandle = null;
        micBtn.classList.remove("listening");
        micBtn.textContent = "🎤";
        if (input.value.trim()) {
          void this.handleSubmit();
        }
      },
      onError: (code) => {
        this.voiceHandle = null;
        micBtn.classList.remove("listening");
        micBtn.textContent = "🎤";
        if (code === "aborted") {
          return;
        }
        this.store?.dispatch({
          type: "CHAT_APPEND",
          message: { role: "assistant", text: `⚠️ ${describeVoiceError(code)}`, ts: Date.now() },
        });
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
    this.pendingImage = parsed;
    this.pendingImageDataUrl = dataUrl;
    const thumb = this.querySelector<HTMLImageElement>("#chat-image-thumb");
    if (thumb) {
      thumb.src = dataUrl;
    }
    const preview = this.querySelector<HTMLElement>("#chat-image-preview");
    if (preview) {
      preview.hidden = false;
    }
  }

  private clearPendingImage(): void {
    this.pendingImage = null;
    this.pendingImageDataUrl = null;
    const input = this.querySelector<HTMLInputElement>("#chat-image-input");
    if (input) {
      input.value = "";
    }
    const preview = this.querySelector<HTMLElement>("#chat-image-preview");
    if (preview) {
      preview.hidden = true;
    }
    this.hideImageError();
  }

  private showImageError(text: string): void {
    const el = this.querySelector<HTMLElement>("#chat-image-error");
    if (!el) {
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  private hideImageError(): void {
    const el = this.querySelector<HTMLElement>("#chat-image-error");
    if (el) {
      el.hidden = true;
    }
  }

  private renderMessages(): void {
    const container = this.querySelector("#chat-messages");
    const contextLabel = this.querySelector("#chat-context-label");
    if (!container || !contextLabel) {
      return;
    }
    const state = this.store?.state.value;
    const messages = state?.chatMessages ?? [];
    container.innerHTML = messages
      .map((m) => {
        const thumb = m.imageDataUrl ? `<img class="chat-message-image" src="${m.imageDataUrl}" alt="Attached screenshot" />` : "";
        return `<div class="chat-message ${m.role}">${thumb}${escapeHtml(m.text)}</div>`;
      })
      .join("");
    container.scrollTop = container.scrollHeight;
    contextLabel.textContent = state?.activeFilePath ? `Context: ${state.activeFilePath}` : "Context: no file open";
  }

  private async handleSubmit(): Promise<void> {
    const input = this.querySelector<HTMLInputElement>("#chat-input")!;
    const text = input.value.trim();
    if (!text || !this.store) {
      return;
    }
    input.value = "";
    const image = this.pendingImage;
    const imageDataUrl = this.pendingImageDataUrl ?? undefined;
    this.clearPendingImage();

    const userMessage: ChatUiMessage = { role: "user", text, ts: Date.now(), ...(imageDataUrl !== undefined ? { imageDataUrl } : {}) };
    this.store.dispatch({ type: "CHAT_APPEND", message: userMessage });

    const provider = getAiAssistProvider();
    if (!provider) {
      this.store.dispatch({
        type: "CHAT_APPEND",
        message: { role: "assistant", text: "⚠️ Add an Anthropic API key in Settings to use AI chat.", ts: Date.now() },
      });
      return;
    }

    const state = this.store.state.value;
    // Only the message just composed carries an image - history entries
    // never do (ChatUiMessage's imageDataUrl is for local bubble display
    // only, never resent), so this can't be a blanket .map() over the
    // whole array.
    const priorHistory = state.chatMessages.map((m) => ({ role: m.role, content: m.text }));
    const history = [...priorHistory, { role: userMessage.role, content: userMessage.text, ...(image !== undefined && image !== null ? { image } : {}) }];
    const activeFile = state.activeFilePath ? state.files[state.activeFilePath] : undefined;

    try {
      const reply = await provider.chat({
        code: activeFile?.content ?? "",
        ...(activeFile?.language !== undefined ? { language: activeFile.language } : {}),
        messages: history,
      });
      this.store.dispatch({ type: "CHAT_APPEND", message: { role: "assistant", text: reply, ts: Date.now() } });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.store.dispatch({ type: "CHAT_APPEND", message: { role: "assistant", text: `⚠️ ${message}`, ts: Date.now() } });
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-chat")) {
  customElements.define("x-chat", ChatElement);
}
