import type { AspectTarget } from "@justjs/application";

export interface AiAssistProviderConfig {
  readonly apiKey: string;
  // Model used by complete() - default "claude-haiku-4-5". Kept separate
  // from capableModel since completions must feel responsive; a slower
  // model here would defeat the point of a button-triggered suggestion.
  readonly completeModel?: string;
  // Model used by chat()/review()/scaffold() - default "claude-opus-4-8".
  readonly capableModel?: string;
}

// A single image attached to a request - real vision input, sent as an
// Anthropic Messages API image content block, not just stored/displayed
// locally. base64Data is the raw payload only, no "data:...;base64,"
// prefix - callers (e.g. ai-code-editor's core/images.ts) are
// responsible for stripping that themselves.
export interface ImageAttachment {
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  readonly base64Data: string;
}

export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  // Only meaningful on the message actually being sent this turn -
  // history entries don't carry one, keeping the payload from growing
  // with old images on every subsequent turn.
  readonly image?: ImageAttachment;
}

export interface CompletionRequest {
  readonly codeBeforeCursor: string;
  readonly codeAfterCursor: string;
  readonly language?: string;
}

export interface ChatRequest {
  readonly messages: ChatMessage[];
  readonly code: string;
  readonly language?: string;
}

export interface ReviewRequest {
  readonly code: string;
  readonly language?: string;
  readonly image?: ImageAttachment;
}

export type ReviewSeverity = "error" | "warning" | "info";

export interface ReviewFinding {
  readonly severity: ReviewSeverity;
  readonly message: string;
  readonly line?: number;
}

export interface ScaffoldRequest {
  readonly description: string;
  readonly language?: string;
}

export interface ScaffoldedFile {
  readonly path: string;
  readonly content: string;
}

export interface ScaffoldProjectRequest {
  readonly description: string;
  readonly image?: ImageAttachment;
}

export interface DesignDocRequest {
  readonly description: string;
}

export interface SlidesRequest {
  readonly description: string;
}

export interface AiAssistProvider {
  readonly concern: "aiAssist";
  readonly strategy: string;
  complete(req: CompletionRequest): Promise<string>;
  chat(req: ChatRequest): Promise<string>;
  review(req: ReviewRequest): Promise<ReviewFinding[]>;
  scaffold(req: ScaffoldRequest): Promise<string>;
  // Generates a whole small multi-file project (structured tool-use
  // output, same mechanism review() uses for its findings) rather than
  // one file's content - distinct from scaffold() rather than an
  // overload, since callers need to explicitly opt into "replace
  // everything" semantics.
  scaffoldProject(req: ScaffoldProjectRequest): Promise<ScaffoldedFile[]>;
  // A Markdown design document with an embedded Mermaid diagram - free
  // text out, not scaffold() reused, because scaffold()'s prompt
  // explicitly tells the model to omit markdown fences (to stop it
  // wrapping code responses in backticks), which fights intentionally
  // emitting a real ```mermaid fence.
  generateDesignDoc(req: DesignDocRequest): Promise<string>;
  // A Markdown slide deck, slides separated by a bare `---` line - its
  // own dedicated prompt, not generateDesignDoc() reused, because a deck
  // needs terse per-slide bullets rather than document prose, and a
  // diagram is optional per slide rather than mandatory once overall.
  generateSlides(req: SlidesRequest): Promise<string>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)` call
  // for every concern actually listed in the `aspects` config it's given
  // (application/scm/main/src/core/boot.ts) - aiAssist isn't a
  // rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a registered
  // factory returns, same as MemoryProvider.weave().
  weave(target: AspectTarget): void;
}

export class AiAssistProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AiAssistProviderError";
  }
}
