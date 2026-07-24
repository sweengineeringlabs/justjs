import type { FeatureStore } from "@justjs/data";
import type { AgentStepResult, ImageAttachment } from "@justjs/ai-assist";
import type { AgentToolName, AgentUiMessage, AppState, AppAction, ChatUiMessage } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { AGENT_TOOLS, MAX_AGENT_ITERATIONS, executeAgentTool, toAgentStepHistory } from "../core/agent_loop.js";
import { getEnabledAgentChannels } from "./agent_channels.js";
import { COMMS_AGENT_TOOLS, executeAgentCommsTool } from "./agent_comms_tools.js";
import { isSupportedImageType, MAX_IMAGE_BYTES, MAX_IMAGE_MB, parseDataUrl, readImageFileAsDataUrl } from "../core/images.js";
import { describeVoiceError, isVoicePromptSupported, startVoicePrompt } from "../core/speech.js";
import type { VoicePromptHandle } from "../core/speech.js";
import "@justjs/component-view";
import type { ToggleView } from "@justjs/component-view";
import { ChatBase } from "../features/chat/chat_component.gen.js";

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
//
// Extends ChatBase (justweb-generated, justjs#116, part of justjs#113's
// epic) - see justjs#113's shared note for why customElement.tagName is
// deliberately not set (ChatBase self-registers under its harmless
// default js-chat; ChatElement keeps its own explicit x-chat
// registration). #chat-mic-btn stays a plain querySelector call -
// conditionally rendered (voiceSupported), so it can't be a declared
// dom.elements entry without permanently breaking _hasAllElements() on
// a voice-unsupported device.
export class ChatElement extends ChatBase {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;
  private voiceHandle: VoicePromptHandle | null = null;
  private pendingImage: ImageAttachment | null = null;
  private pendingImageDataUrl: string | null = null;

  // Agent mode (justjs#134) - a multi-step tool-use loop layered on top
  // of the same store/transcript pattern plain chat uses, but with its
  // own separate AppState.agentMessages slice (see core/state.ts's
  // AgentUiMessage doc comment for why it isn't merged into
  // chatMessages) and its own confirm-before-apply gate for anything
  // that mutates files.
  private mode: "chat" | "agent" = "chat";
  private agentPhase: "idle" | "running" | "awaiting-confirmation" = "idle";
  private agentStopRequested = false;
  // A field, not a local loop variable - must survive a confirm/deny
  // pause (a fresh continueAgentLoop() call resuming after one) without
  // resetting to 0, or the MAX_AGENT_ITERATIONS cap would never bind on
  // any turn with more than one mutating step.
  private agentIterationCount = 0;
  private agentCwd = "";
  // "action" resolves synchronously (a plain FileMap reducer dispatch);
  // "effect" is justjs#136's addition - a real async network call (send
  // a message/create a post), already fully resolved (credentials/args
  // baked into the closure) by whichever module classified the tool
  // call, so this component never needs to know which provider it is.
  private pendingAgentTool:
    | { readonly kind: "action"; readonly toolCallId: string; readonly action: AppAction; readonly summary: string }
    | { readonly kind: "effect"; readonly toolCallId: string; readonly run: () => Promise<{ readonly output: string; readonly isError: boolean }>; readonly summary: string }
    | null = null;
  // True only while an "effect" confirmation's real network call is
  // in-flight - guards handleStopAgentLoop() from firing a second,
  // racing Deny against the same pendingAgentTool handleConfirmAgentTool
  // is still awaiting (see handleStopAgentLoop's own comment).
  private agentConfirmBusy = false;
  private confirmBtn!: HTMLButtonElement;
  private denyBtn!: HTMLButtonElement;
  private sendBtn!: HTMLButtonElement;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => {
      this.renderMessages();
      this.renderAgentMessages();
    };
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    const voiceSupported = isVoicePromptSupported();
    this.innerHTML = `
      <view-toggle id="chat-mode-toggle" data-part="mode-toggle"></view-toggle>
      <div id="chat-messages" data-part="messages"></div>
      <div id="chat-agent-messages" class="chat-agent-messages" data-part="agent-messages" hidden></div>
      <div id="chat-agent-confirm" class="scaffold-replace-confirm" data-part="agent-confirm" hidden>
        <p id="chat-agent-confirm-message" data-part="agent-confirm-message"></p>
        <div class="scaffold-replace-actions">
          <button id="chat-agent-confirm-btn" type="button">Confirm</button>
          <button id="chat-agent-deny-btn" type="button" class="btn-secondary">Deny</button>
        </div>
      </div>
      <p id="chat-context-label" class="chat-context-label" data-part="context-label"></p>
      <div id="chat-image-preview" class="attach-image-preview" data-part="image-preview" hidden>
        <img id="chat-image-thumb" data-part="image-thumb" alt="Attached screenshot" />
        <span class="attach-image-label">Screenshot attached</span>
        <button id="chat-image-remove" type="button" class="btn-secondary">Remove</button>
      </div>
      <p id="chat-image-error" class="attach-image-error" data-part="image-error" hidden></p>
      <form id="chat-form">
        <input id="chat-input" type="text" data-part="message-input" placeholder="Ask about your code..." autocomplete="off" />
        <input id="chat-image-input" type="file" data-part="image-input" accept="image/*" hidden />
        <button id="chat-image-btn" type="button" aria-label="Attach screenshot">📷</button>
        ${voiceSupported ? `<button id="chat-mic-btn" type="button" aria-label="Hold to speak">🎤</button>` : ""}
        <button id="chat-agent-stop-btn" type="button" class="btn-secondary" data-part="agent-stop-btn" hidden>Stop</button>
        <button id="chat-send-btn" type="submit" class="btn-primary">Send</button>
      </form>
    `;
    // Binds this.messages/this.messageInput/etc via real data-part
    // lookups - must run after the markup above exists, since
    // ChatBase's own connectedCallback() calls _bindElements()
    // synchronously.
    super.connectedCallback();

    this.sendBtn = this.querySelector<HTMLButtonElement>("#chat-send-btn")!;

    this.querySelector("#chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSubmit();
    });

    this.querySelector("#chat-image-btn")?.addEventListener("click", () => this.imageInput.click());
    this.imageInput.addEventListener("change", () => void this.handleImageSelected(this.imageInput));
    this.querySelector("#chat-image-remove")?.addEventListener("click", () => this.clearPendingImage());

    const modeToggle = this.modeToggle as ToggleView;
    modeToggle.options = [
      { value: "chat", label: "Chat" },
      { value: "agent", label: "Agent" },
    ];
    modeToggle.activeValue = "chat";
    modeToggle.addEventListener("change", (e) => {
      this.setMode((e as CustomEvent<{ value: "chat" | "agent" }>).detail.value);
    });
    this.confirmBtn = this.querySelector<HTMLButtonElement>("#chat-agent-confirm-btn")!;
    this.denyBtn = this.querySelector<HTMLButtonElement>("#chat-agent-deny-btn")!;
    this.confirmBtn.addEventListener("click", () => void this.handleConfirmAgentTool());
    this.denyBtn.addEventListener("click", () => this.handleDenyAgentTool());
    this.agentStopBtn.addEventListener("click", () => this.handleStopAgentLoop());

    if (voiceSupported) {
      this.setupVoicePrompt();
    }
    this.renderMessages();
    this.renderAgentMessages();
    this.updateAgentControls();
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
    const input = this.messageInput;
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
    this.imageThumb.src = dataUrl;
    this.imagePreview.hidden = false;
  }

  private clearPendingImage(): void {
    this.pendingImage = null;
    this.pendingImageDataUrl = null;
    this.imageInput.value = "";
    this.imagePreview.hidden = true;
    this.hideImageError();
  }

  private showImageError(text: string): void {
    this.imageError.hidden = false;
    this.imageError.textContent = text;
  }

  private hideImageError(): void {
    this.imageError.hidden = true;
  }

  private renderMessages(): void {
    // dataContext (ADR-0004) can be set on a freshly-constructed element
    // before it's ever appended to the DOM (@justjs/application's own
    // render adapter assigns it ahead of container.replaceChildren() -
    // component_registry_adapter.ts) - meaning this can run before
    // connectedCallback() ever binds this.messages/etc (real bug found
    // and fixed in justjs#115's editor.ts migration; guarding
    // proactively here). Checking this.isConnected, not this.messages -
    // ChatBase's bound-element getters now throw if read before
    // _bindElements() has run (justweb#83), so the old `!this.messages`
    // guard would crash on the exact read it was meant to skip.
    // isConnected is a native Node property, always safe to read, and
    // false for exactly this pre-connectedCallback window.
    // connectedCallback() calls this again once real, so no-oping here
    // isn't a missed update.
    if (!this.isConnected) {
      return;
    }
    const state = this.store?.state.value;
    const messages = state?.chatMessages ?? [];
    this.messages.innerHTML = messages
      .map((m) => {
        const thumb = m.imageDataUrl ? `<img class="chat-message-image" src="${m.imageDataUrl}" alt="Attached screenshot" />` : "";
        return `<div class="chat-message ${m.role}">${thumb}${escapeHtml(m.text)}</div>`;
      })
      .join("");
    this.messages.scrollTop = this.messages.scrollHeight;
    this.contextLabel.textContent = state?.activeFilePath ? `Context: ${state.activeFilePath}` : "Context: no file open";
  }

  // Mode switching is only reachable while idle - updateAgentControls()
  // disables the toggle itself whenever a loop is running or awaiting
  // confirmation, so this guard is a backstop, not the primary gate.
  private setMode(mode: "chat" | "agent"): void {
    if (this.agentPhase !== "idle") {
      (this.modeToggle as ToggleView).activeValue = this.mode;
      return;
    }
    this.mode = mode;
    (this.modeToggle as ToggleView).activeValue = mode;
    this.messages.hidden = mode !== "chat";
    this.agentMessages.hidden = mode !== "agent";
    this.querySelector<HTMLElement>("#chat-image-btn")!.hidden = mode !== "chat";
    const micBtn = this.querySelector<HTMLButtonElement>("#chat-mic-btn");
    if (micBtn) {
      micBtn.hidden = mode !== "chat";
    }
    if (mode === "agent") {
      this.clearPendingImage();
    }
  }

  private renderAgentMessages(): void {
    // Same isConnected guard as renderMessages() - see its comment.
    if (!this.isConnected) {
      return;
    }
    const state = this.store?.state.value;
    const messages = state?.agentMessages ?? [];
    this.agentMessages.innerHTML = messages.map((m) => this.renderAgentMessage(m)).join("");
    this.agentMessages.scrollTop = this.agentMessages.scrollHeight;
  }

  private renderAgentMessage(m: AgentUiMessage): string {
    switch (m.kind) {
      case "user":
        return `<div class="chat-message user">${escapeHtml(m.text)}</div>`;
      case "assistant":
      case "error":
        return `<div class="chat-message assistant">${escapeHtml(m.text)}</div>`;
      case "tool_call": {
        const suffix = m.text ? ` — ${escapeHtml(m.text)}` : "";
        return `<div class="agent-step">🔧 ${escapeHtml(m.tool)}(${escapeHtml(JSON.stringify(m.input))})${suffix}</div>`;
      }
      case "tool_result":
        if (m.denied) {
          return `<div class="agent-step agent-step-error">🚫 Denied</div>`;
        }
        if (m.isError) {
          return `<div class="agent-step agent-step-error">⚠️ ${escapeHtml(m.text)}</div>`;
        }
        return `<div class="agent-step">✅ ${escapeHtml(m.text)}</div>`;
      case "stopped":
        return `<div class="agent-step agent-step-stopped">⏹ Stopped</div>`;
    }
  }

  private appendAgentMessage(message: AgentUiMessage): void {
    this.store?.dispatch({ type: "AGENT_APPEND", message });
  }

  private updateAgentControls(): void {
    const busy = this.mode === "agent" && this.agentPhase !== "idle";
    this.agentStopBtn.hidden = this.agentPhase === "idle";
    this.agentStopBtn.textContent = this.agentStopRequested ? "Stopping…" : "Stop";
    this.agentStopBtn.disabled = this.agentStopRequested;
    this.messageInput.disabled = busy;
    this.sendBtn.disabled = busy;
    this.modeToggle.classList.toggle("chat-mode-toggle-disabled", this.agentPhase !== "idle");
  }

  private async handleAgentSubmit(): Promise<void> {
    const input = this.messageInput;
    const text = input.value.trim();
    if (!text || !this.store || this.agentPhase !== "idle") {
      return;
    }
    input.value = "";
    this.agentIterationCount = 0;
    this.agentStopRequested = false;
    this.agentCwd = "";
    this.appendAgentMessage({ kind: "user", text, ts: Date.now() });
    this.agentPhase = "running";
    this.updateAgentControls();
    await this.continueAgentLoop();
  }

  // The loop driver - one iteration is one agentStep() round-trip. Runs
  // while agentPhase === "running", pausing (via an early return, not a
  // recursive call) the moment a tool call needs user confirmation. The
  // Stop control and the MAX_AGENT_ITERATIONS cap are both checked at the
  // top of every iteration, matching this app's "no unbounded loops" rule
  // and the "Stop can't cancel an in-flight request, only the next one"
  // interpretation the plan settled on (no AbortController anywhere in
  // this codebase's fetch layer).
  private async continueAgentLoop(): Promise<void> {
    if (!this.store) {
      return;
    }
    while (this.agentPhase === "running") {
      if (this.agentStopRequested) {
        this.appendAgentMessage({ kind: "stopped", ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }
      if (this.agentIterationCount >= MAX_AGENT_ITERATIONS) {
        this.appendAgentMessage({ kind: "error", text: `⚠️ Reached the ${MAX_AGENT_ITERATIONS}-step limit for this turn.`, ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }
      this.agentIterationCount += 1;

      const provider = getAiAssistProvider();
      if (!provider) {
        this.appendAgentMessage({ kind: "error", text: "⚠️ Add an Anthropic API key in Settings to use Agent mode.", ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }

      const state = this.store.state.value;
      const activeFile = state.activeFilePath ? state.files[state.activeFilePath] : undefined;
      let result: AgentStepResult;
      try {
        result = await provider.agentStep({
          code: activeFile?.content ?? "",
          ...(activeFile?.language !== undefined ? { language: activeFile.language } : {}),
          tools: [...AGENT_TOOLS, ...COMMS_AGENT_TOOLS],
          messages: toAgentStepHistory(this.store.state.value.agentMessages),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        this.appendAgentMessage({ kind: "error", text: `⚠️ ${message}`, ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }

      if (result.kind === "text") {
        this.appendAgentMessage({ kind: "assistant", text: result.text, ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }
      if (result.kind === "max_tokens") {
        this.appendAgentMessage({ kind: "error", text: "⚠️ The model's response was cut off before finishing this step.", ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }

      const { toolCall } = result;
      this.appendAgentMessage({
        kind: "tool_call",
        id: toolCall.id,
        tool: toolCall.name as AgentToolName,
        input: (toolCall.input ?? {}) as Record<string, unknown>,
        ...(result.text ? { text: result.text } : {}),
        ts: Date.now(),
      });

      const freshState = this.store.state.value;
      const isCommsAgentTool = COMMS_AGENT_TOOLS.some((t) => t.name === toolCall.name);
      const outcome = isCommsAgentTool
        ? await executeAgentCommsTool(toolCall.name, toolCall.input, getEnabledAgentChannels())
        : executeAgentTool(toolCall.name, toolCall.input, freshState.files, freshState.emptyFolders, this.agentCwd, getEnabledAgentChannels());

      if (outcome.kind === "immediate") {
        if (outcome.cwd !== undefined) {
          this.agentCwd = outcome.cwd;
        }
        this.appendAgentMessage({ kind: "tool_result", toolCallId: toolCall.id, text: outcome.output, isError: outcome.isError, ts: Date.now() });
        continue;
      }

      // needs_confirm/needs_confirm_effect - pause here. The invariant
      // that must hold from this point on: this tool_use must get a
      // matching tool_result (Confirm, Deny, or Stop-while-awaiting all
      // provide one) before the next agentStep() call, or that call
      // sends Anthropic an invalid message sequence.
      if (this.agentStopRequested) {
        // Stop was clicked while this round-trip was already in flight,
        // and it came back wanting to mutate a file - honor the stop
        // instead of surfacing a new confirm prompt the user already
        // asked to be done with. Still resolves the dangling tool_use
        // (as a denial) rather than abandoning it.
        this.appendAgentMessage({
          kind: "tool_result",
          toolCallId: toolCall.id,
          text: "User denied this action.",
          isError: true,
          denied: true,
          ts: Date.now(),
        });
        this.appendAgentMessage({ kind: "stopped", ts: Date.now() });
        this.agentPhase = "idle";
        this.updateAgentControls();
        return;
      }
      this.pendingAgentTool =
        outcome.kind === "needs_confirm"
          ? { kind: "action", toolCallId: toolCall.id, action: outcome.action, summary: outcome.summary }
          : { kind: "effect", toolCallId: toolCall.id, run: outcome.run, summary: outcome.summary };
      this.agentPhase = "awaiting-confirmation";
      this.agentConfirmMessage.textContent = outcome.summary;
      this.agentConfirm.hidden = false;
      this.updateAgentControls();
      return;
    }
  }

  private clearPendingAgentTool(): void {
    this.pendingAgentTool = null;
    this.agentConfirm.hidden = true;
  }

  private async handleConfirmAgentTool(): Promise<void> {
    if (!this.pendingAgentTool || !this.store) {
      return;
    }
    const pending = this.pendingAgentTool;
    if (pending.kind === "action") {
      this.store.dispatch(pending.action);
      this.appendAgentMessage({ kind: "tool_result", toolCallId: pending.toolCallId, text: `${pending.summary} — done.`, isError: false, ts: Date.now() });
      this.clearPendingAgentTool();
      this.resumeAfterConfirmation();
      return;
    }

    // "effect" - a real async network call. Busy-guarded (disabled
    // Confirm/Deny, "Sending…" label) since nothing else here prevents a
    // double-click mid-flight, and handleStopAgentLoop() checks the same
    // flag to avoid racing a second Deny against this same
    // pendingAgentTool while its own run() is still pending.
    this.setConfirmBusy(true);
    try {
      const result = await pending.run();
      this.appendAgentMessage({ kind: "tool_result", toolCallId: pending.toolCallId, text: result.output, isError: result.isError, ts: Date.now() });
    } catch (e) {
      // Backstop only - agent_comms_tools.ts's run() already catches its
      // own real provider/network errors and resolves isError:true
      // rather than throwing; never swallowed regardless.
      const message = e instanceof Error ? e.message : String(e);
      this.appendAgentMessage({ kind: "tool_result", toolCallId: pending.toolCallId, text: `⚠️ ${message}`, isError: true, ts: Date.now() });
    } finally {
      this.setConfirmBusy(false);
      this.clearPendingAgentTool();
      this.resumeAfterConfirmation();
    }
  }

  private setConfirmBusy(busy: boolean): void {
    this.agentConfirmBusy = busy;
    this.confirmBtn.disabled = busy;
    this.denyBtn.disabled = busy;
    this.confirmBtn.textContent = busy ? "Sending…" : "Confirm";
  }

  private handleDenyAgentTool(): void {
    if (!this.pendingAgentTool) {
      return;
    }
    const { toolCallId } = this.pendingAgentTool;
    this.appendAgentMessage({ kind: "tool_result", toolCallId, text: "User denied this action.", isError: true, denied: true, ts: Date.now() });
    this.clearPendingAgentTool();
    this.resumeAfterConfirmation();
  }

  private resumeAfterConfirmation(): void {
    if (this.agentStopRequested) {
      this.appendAgentMessage({ kind: "stopped", ts: Date.now() });
      this.agentPhase = "idle";
      this.updateAgentControls();
      return;
    }
    this.agentPhase = "running";
    this.updateAgentControls();
    void this.continueAgentLoop();
  }

  // Stop mid-network-call just requests a stop, checked at the top of
  // the loop's next iteration (no AbortController exists to cancel the
  // in-flight call itself). Stop while a confirm banner is showing is
  // treated as an immediate Deny-then-terminate - never a silent
  // abandon of the pending tool_use, per continueAgentLoop()'s own
  // invariant comment. Exception: while an "effect" confirmation's real
  // send/post is already in flight (agentConfirmBusy), Deny must not
  // fire a second time against the same pendingAgentTool
  // handleConfirmAgentTool() is still awaiting - Stop is honored
  // instead the moment that awaited call resolves, via
  // resumeAfterConfirmation()'s own agentStopRequested check (same
  // "checked at the next safe point, not mid-flight" treatment the
  // model round-trip itself already gets).
  private handleStopAgentLoop(): void {
    if (this.agentPhase === "idle") {
      return;
    }
    this.agentStopRequested = true;
    this.updateAgentControls();
    if (this.agentPhase === "awaiting-confirmation" && !this.agentConfirmBusy) {
      this.handleDenyAgentTool();
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.mode === "agent") {
      void this.handleAgentSubmit();
      return;
    }
    const input = this.messageInput;
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
