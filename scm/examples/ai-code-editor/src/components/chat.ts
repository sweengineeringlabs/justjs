import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction, ChatUiMessage } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The AI chat surface: each user turn sends the full conversation plus
// the editor's current buffer as context to AiAssistProvider.chat(). No
// streaming - @justjs/network's FetchAdapter fully buffers the response,
// so a reply appears all at once after one blocking wait, not
// token-by-token.
export class ChatElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderMessages();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div id="chat-messages"></div>
      <p id="chat-context-label" class="chat-context-label"></p>
      <form id="chat-form">
        <input id="chat-input" type="text" placeholder="Ask about your code..." autocomplete="off" />
        <button type="submit">Send</button>
      </form>
    `;
    this.querySelector("#chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSubmit();
    });
    this.renderMessages();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
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
      .map((m) => `<div class="chat-message ${m.role}">${escapeHtml(m.text)}</div>`)
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

    const userMessage: ChatUiMessage = { role: "user", text, ts: Date.now() };
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
    const history = [...state.chatMessages, userMessage].map((m) => ({
      role: m.role,
      content: m.text,
    }));
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
