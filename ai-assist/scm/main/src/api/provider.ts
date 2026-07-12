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

export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
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
