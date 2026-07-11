import type { AspectTarget } from "@justjs/application";
import type {
  ConsolidationResult,
  MemoryProvider,
  MemoryProviderConfig,
  MemoryQuery,
  MemoryQueryResult,
  MemoryWriteInput,
} from "../api/provider.js";
import { MemoryProviderError } from "../api/provider.js";
import type { MemoryRecord } from "../api/record.js";
import { computeFakeEmbedding, cosineSimilarity } from "./fake_embedding.js";

const DEFAULT_CONSOLIDATION_THRESHOLD = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 30 * MS_PER_DAY; // 30 days
const DEFAULT_QUERY_LIMIT = 20;
const DEFAULT_MIN_SCORE = 0.15;

function storageKey(userId: string): string {
  return `justjs:memory:v1:${userId}`;
}

// crypto.randomUUID()'s availability in the Android WebView's JS engine is
// unconfirmed, not assumed - verified on real hardware separately. This
// fallback is not cryptographically strong; fine for a demo-scale local
// id, not a security-sensitive token.
function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// The one "dummy" strategy this package ships - in-memory, mirrored to
// localStorage when available. No real backend, no real LLM, no real
// embedding model; see fake_embedding.ts for the deterministic stand-in.
// A real provider (real DB, real vector search, real LLM-driven
// consolidation) plugs in later against the same MemoryProvider contract
// without touching any consumer.
export class DefaultMemoryProvider implements MemoryProvider {
  readonly concern = "memory" as const;
  readonly strategy = "dummy" as const;

  private readonly records = new Map<string, MemoryRecord>();
  private readonly loadedUserIds = new Set<string>();
  private readonly consolidationThreshold: number;
  private readonly staleAfterMsForForgetting: number;

  constructor(config?: MemoryProviderConfig) {
    this.consolidationThreshold = config?.consolidationThreshold ?? DEFAULT_CONSOLIDATION_THRESHOLD;
    this.staleAfterMsForForgetting = config?.staleAfterMsForForgetting ?? DEFAULT_STALE_AFTER_MS;
  }

  // Real no-op, required by boot()'s unconditional
  // `spec.factory().weave(target)` call for every registered aspect
  // concern - memory isn't a rendering-pipeline concern with anything to
  // weave into a route/component target, but the method must exist.
  weave(_target: AspectTarget): void {}

  // Lazy, per-user load rather than reading all of localStorage up front -
  // avoids needing to enumerate every localStorage key by prefix, and
  // this provider genuinely doesn't know which userIds exist until asked.
  private ensureLoaded(userId: string): void {
    if (this.loadedUserIds.has(userId)) {
      return;
    }
    this.loadedUserIds.add(userId);
    try {
      const raw = globalThis.localStorage?.getItem(storageKey(userId));
      if (raw) {
        const stored = JSON.parse(raw) as MemoryRecord[];
        for (const record of stored) {
          this.records.set(record.id, record);
        }
      }
    } catch {
      // localStorage unavailable, disabled, or the stored JSON is
      // corrupted - degrade to in-memory-only for this session rather
      // than throw, same graceful-degradation shape build.sh's
      // --native-libs flag already established in this codebase.
    }
  }

  private persist(userId: string): void {
    try {
      const userRecords = [...this.records.values()].filter((r) => r.userId === userId);
      globalThis.localStorage?.setItem(storageKey(userId), JSON.stringify(userRecords));
    } catch {
      // Best-effort only - a full/disabled localStorage shouldn't break
      // the in-memory operation that just succeeded.
    }
  }

  async write(input: MemoryWriteInput): Promise<MemoryRecord> {
    this.ensureLoaded(input.userId);
    const now = Date.now();

    if (input.id) {
      const existing = this.records.get(input.id);
      if (!existing || existing.userId !== input.userId) {
        throw new MemoryProviderError(`No record ${input.id} owned by user ${input.userId} to update`);
      }
      const contentChanged = input.content !== existing.content;
      const embedding =
        input.embedding ?? (input.kind === "semantic" && contentChanged
          ? computeFakeEmbedding(input.content)
          : existing.embedding);
      // exactOptionalPropertyTypes forbids assigning `undefined` to an
      // optional property outright - conditionally include the key
      // instead, same idiom lifecycle_pipeline.ts's toDataContext()
      // already uses in this codebase. Omitting tags/embedding on an
      // update preserves the existing value (via ...existing) rather
      // than clearing it.
      const updated: MemoryRecord = {
        ...existing,
        kind: input.kind,
        content: input.content,
        source: input.source,
        updatedAt: now,
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(embedding !== undefined ? { embedding } : {}),
      };
      this.records.set(updated.id, updated);
      this.persist(input.userId);
      return updated;
    }

    const embedding = input.embedding ?? (input.kind === "semantic" ? computeFakeEmbedding(input.content) : undefined);
    const record: MemoryRecord = {
      id: genId(),
      userId: input.userId,
      kind: input.kind,
      content: input.content,
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(embedding !== undefined ? { embedding } : {}),
      createdAt: now,
      updatedAt: now,
      source: input.source,
    };
    this.records.set(record.id, record);
    this.persist(input.userId);
    return record;
  }

  async query(q: MemoryQuery): Promise<MemoryQueryResult[]> {
    this.ensureLoaded(q.userId);
    let candidates = [...this.records.values()].filter((r) => r.userId === q.userId);

    if (q.kind) {
      const kinds = Array.isArray(q.kind) ? q.kind : [q.kind];
      candidates = candidates.filter((r) => kinds.includes(r.kind));
    }
    if (q.tags && q.tags.length > 0) {
      candidates = candidates.filter((r) => q.tags!.every((tag) => r.tags?.includes(tag)));
    }
    if (q.text) {
      const needle = q.text.toLowerCase();
      candidates = candidates.filter((r) => r.content.toLowerCase().includes(needle));
    }

    let results: MemoryQueryResult[];
    if (q.embedding) {
      const minScore = q.minScore ?? DEFAULT_MIN_SCORE;
      results = candidates
        .map((record) => {
          const embedding = record.embedding ?? computeFakeEmbedding(record.content);
          return { record, score: cosineSimilarity(q.embedding!, embedding) };
        })
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score);
    } else {
      results = [...candidates]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((record) => ({ record }));
    }

    return results.slice(0, q.limit ?? DEFAULT_QUERY_LIMIT);
  }

  async get(userId: string, id: string): Promise<MemoryRecord | null> {
    this.ensureLoaded(userId);
    const record = this.records.get(id);
    return record && record.userId === userId ? record : null;
  }

  async list(userId: string): Promise<MemoryRecord[]> {
    this.ensureLoaded(userId);
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(userId: string, id: string): Promise<void> {
    this.ensureLoaded(userId);
    const record = this.records.get(id);
    // No-op (not an error) for a record not owned by userId - enforces
    // isolation without leaking whether a record with that id exists at
    // all under a different user.
    if (!record || record.userId !== userId) {
      return;
    }
    this.records.delete(id);
    this.persist(userId);
  }

  async consolidate(userId: string): Promise<ConsolidationResult> {
    this.ensureLoaded(userId);
    const createdRecords: MemoryRecord[] = [];
    const deletedRecords: MemoryRecord[] = [];
    const reasoning: string[] = [];

    // Snapshot before any mutation in this call - a record this same
    // call creates is kind:"structured", so it's categorically excluded
    // from this episodic-only snapshot regardless, but snapshotting
    // up front also protects the forgetting pass below from acting on
    // anything the consolidation pass just created or removed.
    const episodic = [...this.records.values()].filter(
      (r) => r.userId === userId && r.kind === "episodic"
    );

    const byTag = new Map<string, MemoryRecord[]>();
    for (const record of episodic) {
      for (const tag of record.tags ?? []) {
        const group = byTag.get(tag) ?? [];
        group.push(record);
        byTag.set(tag, group);
      }
    }

    for (const [tag, group] of byTag) {
      if (group.length < this.consolidationThreshold) {
        continue;
      }
      const now = Date.now();
      const summary: MemoryRecord = {
        id: genId(),
        userId,
        kind: "structured",
        content:
          `Consolidated from ${group.length} notes tagged '${tag}': ` +
          group.map((r) => r.content.slice(0, 80)).join("; "),
        tags: [tag, "consolidated"],
        createdAt: now,
        updatedAt: now,
        source: "agent",
      };
      this.records.set(summary.id, summary);
      createdRecords.push(summary);
      for (const record of group) {
        this.records.delete(record.id);
        deletedRecords.push(record);
      }
      reasoning.push(
        `Consolidated ${group.length} episodic notes tagged '${tag}' into 1 structured summary ` +
          `(ids ${group.map((r) => r.id).join(",")} -> ${summary.id})`
      );
    }

    const now = Date.now();
    for (const record of episodic) {
      if (deletedRecords.some((d) => d.id === record.id)) {
        continue; // already removed by the consolidation pass above
      }
      if (record.source !== "user" || (record.tags && record.tags.length > 0)) {
        continue;
      }
      const ageMs = now - record.updatedAt;
      if (ageMs > this.staleAfterMsForForgetting) {
        this.records.delete(record.id);
        deletedRecords.push(record);
        // justc (0.3.5, verified on real hardware, not assumed - same bug
        // class as fake_embedding.ts's own comment) compiles
        // `ageMs / (24 * 60 * 60 * 1000)` by dropping the wrapping
        // parens, producing `ageMs / 24 * 60 * 60 * 1000` - since `/`
        // and `*` share precedence and are left-associative, that's
        // `((ageMs / 24) * 60) * 60 * 1000`, not `ageMs / 86400000` -
        // confirmed by comparing the actual compiled bundle against this
        // file (a "days ago" value in the billions, not assumed from
        // behavior alone). MS_PER_DAY as a named constant avoids the
        // vulnerable (parenthesized-expr) <op> shape entirely.
        const days = Math.floor(ageMs / MS_PER_DAY);
        reasoning.push(
          `Forgot untagged episodic note ${record.id} (last updated ${days} days ago, no tags, never revisited)`
        );
      }
    }

    if (reasoning.length === 0) {
      reasoning.push("No consolidation or forgetting candidates found for this user.");
    }

    this.persist(userId);
    return { createdRecords, deletedRecords, reasoning };
  }
}
