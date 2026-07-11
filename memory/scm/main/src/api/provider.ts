import type { AspectTarget } from "@justjs/application";
import type { MemoryKind, MemoryRecord, MemorySource } from "./record.js";

export interface MemoryProviderConfig {
  // Minimum episodic records sharing an exact tag before consolidate()
  // synthesizes one structured summary from them. Default 3.
  readonly consolidationThreshold?: number;
  // Age (by updatedAt, ms) beyond which an untagged, source:"user"
  // episodic record is forgotten outright by consolidate(). Default 30 days.
  readonly staleAfterMsForForgetting?: number;
}

export interface MemoryQuery {
  readonly userId: string;
  readonly kind?: MemoryKind | MemoryKind[];
  // structured: exact-match AND over record.tags
  readonly tags?: string[];
  // episodic: case-insensitive substring over content
  readonly text?: string;
  // semantic: cosine similarity vs. each candidate record's embedding
  // (computed on the fly for records with none stored)
  readonly embedding?: number[];
  readonly limit?: number; // default 20
  readonly minScore?: number; // semantic only, default 0.15
}

export interface MemoryQueryResult {
  readonly record: MemoryRecord;
  // present only when the query used `embedding`
  readonly score?: number;
}

export interface MemoryWriteInput {
  // present => update the existing record; absent => create
  readonly id?: string;
  readonly userId: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly tags?: string[];
  readonly source: MemorySource;
  // auto-computed for kind:"semantic" if omitted
  readonly embedding?: number[];
}

export interface ConsolidationResult {
  readonly createdRecords: MemoryRecord[]; // new source:"agent" records
  readonly deletedRecords: MemoryRecord[]; // full records removed, for UI diffing
  readonly reasoning: string[]; // one human-readable line per action taken
}

export interface MemoryProvider {
  readonly concern: "memory";
  readonly strategy: string;
  query(q: MemoryQuery): Promise<MemoryQueryResult[]>;
  write(input: MemoryWriteInput): Promise<MemoryRecord>;
  get(userId: string, id: string): Promise<MemoryRecord | null>;
  list(userId: string): Promise<MemoryRecord[]>;
  delete(userId: string, id: string): Promise<void>;
  consolidate(userId: string): Promise<ConsolidationResult>;
  // boot() unconditionally calls `spec.factory().weave(target)` for
  // every registered aspect concern (application/scm/main/src/core/boot.ts,
  // the actual weaving invocation - not the earlier, genuinely generic
  // AC1 validation pass this was initially, incompletely, verified
  // against during planning). Real no-op here, matching every other
  // concern's DefaultXAspect.weave() - memory isn't a rendering-pipeline
  // concern woven into components, but boot() requires this method to
  // exist on whatever a registered factory returns regardless of concern.
  weave(target: AspectTarget): void;
}

export class MemoryProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryProviderError";
  }
}
