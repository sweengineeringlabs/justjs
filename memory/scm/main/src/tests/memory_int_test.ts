import { describe, it, expect } from "bun:test";
import { justjs } from "@justjs/application";
import { DefaultMemoryProvider } from "../core/default_memory_provider.js";
import { MemoryProviderError } from "../api/provider.js";
import { computeFakeEmbedding, cosineSimilarity } from "../core/fake_embedding.js";

// No localStorage in this bun:test environment - every test below runs
// against DefaultMemoryProvider's in-memory-only degradation path,
// exercising exactly the fallback real Android WebViews without DOM
// storage enabled would also hit (see js-runtime's setDomStorageEnabled
// fix - this test suite proves the provider still works without it).

describe("DefaultMemoryProvider CRUD", () => {
  it("test_write_create_assigns_id_and_timestamps", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({
      userId: "u1",
      kind: "episodic",
      content: "likes tea",
      source: "user",
    });
    expect(record.id).toBeTruthy();
    expect(record.createdAt).toBe(record.updatedAt);
    expect(record.content).toBe("likes tea");
  });

  it("test_get_returns_null_for_unknown_id", async () => {
    const provider = new DefaultMemoryProvider();
    expect(await provider.get("u1", "nope")).toBeNull();
  });

  it("test_get_returns_null_when_record_belongs_to_different_user", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({ userId: "u1", kind: "episodic", content: "x", source: "user" });
    expect(await provider.get("u2", record.id)).toBeNull();
  });

  it("test_write_update_merges_fields_and_bumps_updatedAt", async () => {
    const provider = new DefaultMemoryProvider();
    const created = await provider.write({ userId: "u1", kind: "episodic", content: "v1", source: "user" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await provider.write({
      id: created.id,
      userId: "u1",
      kind: "episodic",
      content: "v2",
      source: "user",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.content).toBe("v2");
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it("test_write_update_throws_when_updating_another_users_record", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({ userId: "u1", kind: "episodic", content: "x", source: "user" });
    await expect(
      provider.write({ id: record.id, userId: "u2", kind: "episodic", content: "hijacked", source: "user" })
    ).rejects.toThrow(MemoryProviderError);
  });

  it("test_list_returns_only_the_given_users_records_sorted_by_recency", async () => {
    const provider = new DefaultMemoryProvider();
    await provider.write({ userId: "u1", kind: "episodic", content: "first", source: "user" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await provider.write({ userId: "u1", kind: "episodic", content: "second", source: "user" });
    await provider.write({ userId: "u2", kind: "episodic", content: "other user", source: "user" });

    const list = await provider.list("u1");
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe(second.id); // most recently updated first
  });

  it("test_delete_removes_the_record", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({ userId: "u1", kind: "episodic", content: "x", source: "user" });
    await provider.delete("u1", record.id);
    expect(await provider.get("u1", record.id)).toBeNull();
  });

  it("test_delete_is_a_noop_for_another_users_record", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({ userId: "u1", kind: "episodic", content: "x", source: "user" });
    await provider.delete("u2", record.id);
    // Still there under its real owner - a wrong-user delete must not
    // silently remove someone else's data.
    expect(await provider.get("u1", record.id)).not.toBeNull();
  });
});

describe("DefaultMemoryProvider query()", () => {
  it("test_query_by_tags_requires_all_given_tags", async () => {
    const provider = new DefaultMemoryProvider();
    await provider.write({ userId: "u1", kind: "structured", content: "a", tags: ["diet"], source: "user" });
    const both = await provider.write({
      userId: "u1",
      kind: "structured",
      content: "b",
      tags: ["diet", "vegan"],
      source: "user",
    });
    const results = await provider.query({ userId: "u1", tags: ["diet", "vegan"] });
    expect(results.map((r) => r.record.id)).toEqual([both.id]);
  });

  it("test_query_by_text_is_case_insensitive_substring", async () => {
    const provider = new DefaultMemoryProvider();
    const record = await provider.write({
      userId: "u1",
      kind: "episodic",
      content: "Loves Trail Running",
      source: "user",
    });
    const results = await provider.query({ userId: "u1", text: "trail running" });
    expect(results.map((r) => r.record.id)).toEqual([record.id]);
  });

  it("test_query_by_embedding_scores_related_text_higher_than_unrelated", async () => {
    const provider = new DefaultMemoryProvider();
    const running1 = await provider.write({
      userId: "u1",
      kind: "structured",
      content: "I enjoy trail running",
      source: "user",
    });
    const running2 = await provider.write({
      userId: "u1",
      kind: "structured",
      content: "long distance running on weekends",
      source: "user",
    });
    const diet = await provider.write({
      userId: "u1",
      kind: "structured",
      content: "trying to eat more vegetables",
      source: "user",
    });

    const queryEmbedding = computeFakeEmbedding("jogging outdoors");
    const results = await provider.query({ userId: "u1", embedding: queryEmbedding, minScore: 0 });

    const byId = new Map(results.map((r) => [r.record.id, r.score!]));
    expect(byId.get(running1.id)).toBeGreaterThan(byId.get(diet.id)!);
    expect(byId.get(running2.id)).toBeGreaterThan(byId.get(diet.id)!);
  });

  it("test_query_by_embedding_minScore_filters_out_low_relevance_results", async () => {
    const provider = new DefaultMemoryProvider();
    await provider.write({ userId: "u1", kind: "structured", content: "eating vegetables daily", source: "user" });
    const results = await provider.query({
      userId: "u1",
      embedding: computeFakeEmbedding("trail running marathon"),
      minScore: 0.99,
    });
    expect(results).toHaveLength(0);
  });

  it("test_query_respects_limit", async () => {
    const provider = new DefaultMemoryProvider();
    for (let i = 0; i < 5; i++) {
      await provider.write({ userId: "u1", kind: "episodic", content: `note ${i}`, source: "user" });
    }
    const results = await provider.query({ userId: "u1", limit: 2 });
    expect(results).toHaveLength(2);
  });

  it("test_query_with_no_filters_returns_all_of_users_records", async () => {
    const provider = new DefaultMemoryProvider();
    await provider.write({ userId: "u1", kind: "episodic", content: "a", source: "user" });
    await provider.write({ userId: "u1", kind: "structured", content: "b", source: "user" });
    await provider.write({ userId: "u2", kind: "episodic", content: "c", source: "user" });
    const results = await provider.query({ userId: "u1" });
    expect(results).toHaveLength(2);
  });
});

describe("DefaultMemoryProvider consolidate()", () => {
  it("test_consolidate_below_threshold_is_a_noop", async () => {
    const provider = new DefaultMemoryProvider({ consolidationThreshold: 3 });
    await provider.write({ userId: "u1", kind: "episodic", content: "a", tags: ["diet"], source: "user" });
    await provider.write({ userId: "u1", kind: "episodic", content: "b", tags: ["diet"], source: "user" });

    const result = await provider.consolidate("u1");
    expect(result.createdRecords).toHaveLength(0);
    expect(result.deletedRecords).toHaveLength(0);
    expect(result.reasoning).toEqual(["No consolidation or forgetting candidates found for this user."]);
  });

  it("test_consolidate_at_threshold_creates_one_structured_summary_and_deletes_sources", async () => {
    const provider = new DefaultMemoryProvider({ consolidationThreshold: 3 });
    const a = await provider.write({ userId: "u1", kind: "episodic", content: "note a", tags: ["diet"], source: "user" });
    const b = await provider.write({ userId: "u1", kind: "episodic", content: "note b", tags: ["diet"], source: "user" });
    const c = await provider.write({ userId: "u1", kind: "episodic", content: "note c", tags: ["diet"], source: "user" });

    const result = await provider.consolidate("u1");

    expect(result.createdRecords).toHaveLength(1);
    expect(result.createdRecords[0]!.kind).toBe("structured");
    expect(result.createdRecords[0]!.source).toBe("agent");
    expect(result.createdRecords[0]!.tags).toContain("diet");

    expect(result.deletedRecords.map((r) => r.id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(result.reasoning[0]).toContain("diet");

    expect(await provider.get("u1", a.id)).toBeNull();
    expect(await provider.get("u1", result.createdRecords[0]!.id)).not.toBeNull();
  });

  it("test_consolidate_is_idempotent_and_does_not_resweep_its_own_summary", async () => {
    const provider = new DefaultMemoryProvider({ consolidationThreshold: 3 });
    await provider.write({ userId: "u1", kind: "episodic", content: "a", tags: ["diet"], source: "user" });
    await provider.write({ userId: "u1", kind: "episodic", content: "b", tags: ["diet"], source: "user" });
    await provider.write({ userId: "u1", kind: "episodic", content: "c", tags: ["diet"], source: "user" });

    const first = await provider.consolidate("u1");
    expect(first.createdRecords).toHaveLength(1);

    const second = await provider.consolidate("u1");
    expect(second.createdRecords).toHaveLength(0);
    expect(second.deletedRecords).toHaveLength(0);
    expect(second.reasoning).toEqual(["No consolidation or forgetting candidates found for this user."]);

    // The summary itself must still be there - "idempotent" means the
    // second run does nothing, not that it deletes the first run's output.
    expect(await provider.get("u1", first.createdRecords[0]!.id)).not.toBeNull();
  });

  it("test_consolidate_forgets_stale_untagged_user_records", async () => {
    const provider = new DefaultMemoryProvider({ staleAfterMsForForgetting: 20 });
    const record = await provider.write({ userId: "u1", kind: "episodic", content: "old note", source: "user" });
    await new Promise((r) => setTimeout(r, 40));

    const result = await provider.consolidate("u1");

    expect(result.deletedRecords.map((r) => r.id)).toEqual([record.id]);
    expect(result.reasoning.some((line) => line.includes("Forgot"))).toBe(true);
    expect(await provider.get("u1", record.id)).toBeNull();
  });

  it("test_consolidate_never_forgets_tagged_records_regardless_of_age", async () => {
    const provider = new DefaultMemoryProvider({ staleAfterMsForForgetting: 20 });
    const record = await provider.write({
      userId: "u1",
      kind: "episodic",
      content: "old but tagged",
      tags: ["keep"],
      source: "user",
    });
    await new Promise((r) => setTimeout(r, 40));

    await provider.consolidate("u1");

    expect(await provider.get("u1", record.id)).not.toBeNull();
  });

  it("test_consolidate_never_forgets_agent_authored_records", async () => {
    const provider = new DefaultMemoryProvider({ staleAfterMsForForgetting: 20 });
    const record = await provider.write({
      userId: "u1",
      kind: "episodic",
      content: "agent note",
      source: "agent",
    });
    await new Promise((r) => setTimeout(r, 40));

    await provider.consolidate("u1");

    expect(await provider.get("u1", record.id)).not.toBeNull();
  });

  it("test_consolidate_only_affects_the_given_user", async () => {
    const provider = new DefaultMemoryProvider({ consolidationThreshold: 3 });
    await provider.write({ userId: "u1", kind: "episodic", content: "a", tags: ["diet"], source: "user" });
    await provider.write({ userId: "u1", kind: "episodic", content: "b", tags: ["diet"], source: "user" });
    await provider.write({ userId: "u1", kind: "episodic", content: "c", tags: ["diet"], source: "user" });
    const other = await provider.write({ userId: "u2", kind: "episodic", content: "d", tags: ["diet"], source: "user" });

    await provider.consolidate("u1");

    expect(await provider.get("u2", other.id)).not.toBeNull();
  });
});

describe("memory SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js");
    const resolved = justjs.providers.resolve("memory", "dummy");
    expect(resolved).not.toBeNull();
    expect(resolved!.concern).toBe("memory");
    expect(resolved!.strategy).toBe("dummy");
  });
});

describe("computeFakeEmbedding / cosineSimilarity", () => {
  it("test_same_input_produces_the_same_embedding", () => {
    expect(computeFakeEmbedding("hello world")).toEqual(computeFakeEmbedding("hello world"));
  });

  it("test_self_similarity_is_approximately_one", () => {
    const embedding = computeFakeEmbedding("trail running");
    expect(cosineSimilarity(embedding, embedding)).toBeCloseTo(1, 5);
  });

  it("test_empty_text_produces_a_zero_vector_without_throwing", () => {
    const embedding = computeFakeEmbedding("");
    expect(embedding.every((v) => v === 0)).toBe(true);
  });
});
