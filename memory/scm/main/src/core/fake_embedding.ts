// Deterministic, dependency-free stand-in for a real embedding model -
// v1 has no ML dependency and no network call.
//
// Pure word-hashing alone was tried first and rejected: two different
// words ("jogging" vs "running") hash to essentially random, unrelated
// buckets, so genuinely different vocabulary describing the same topic
// scored no better than genuinely unrelated text - confirmed directly by
// a failing test, not assumed. A real embedding model captures that kind
// of relatedness from training data; this fake one has none. Instead, a
// small, explicit, curated synonym-to-concept table maps specific known
// related words onto the same bucket before hashing - honest about being
// a demo-scale fake (not real NLP), but genuinely differentiates the
// concepts it knows about from everything else. Words outside this table
// still hash individually, so exact/near-exact phrasing continues to
// score highly via ordinary token overlap - the table only adds
// topic-level relatedness for a deliberately small, known vocabulary.
const CONCEPT_SYNONYMS: Record<string, string> = {
  run: "exercise",
  running: "exercise",
  runs: "exercise",
  jog: "exercise",
  jogging: "exercise",
  trail: "exercise",
  marathon: "exercise",
  exercise: "exercise",
  workout: "exercise",
  hike: "exercise",
  hiking: "exercise",
  eat: "food",
  eating: "food",
  ate: "food",
  vegetable: "food",
  vegetables: "food",
  diet: "food",
  meal: "food",
  nutrition: "food",
  sleep: "rest",
  sleeping: "rest",
  nap: "rest",
  rest: "rest",
  tired: "rest",
};

export const DEFAULT_EMBEDDING_DIMS = 64;

function hashToken(token: string): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (h * 31 + token.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function computeFakeEmbedding(text: string, dims = DEFAULT_EMBEDDING_DIMS): number[] {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const token of tokens) {
    const canonical = CONCEPT_SYNONYMS[token] ?? token;
    const bucket = hashToken(canonical) % dims;
    // justc (0.3.5, verified on real hardware, not assumed) compiles
    // `(vector[bucket] ?? 0) + 1` by dropping the wrapping parens around
    // the `??` expression, producing `vector[bucket] ?? 0 + 1` - since
    // `+` binds tighter than `??`, that's `vector[bucket] ?? (0 + 1)`,
    // and because every bucket starts at 0 (not undefined, via .fill(0)
    // above), `??`'s right side never triggers - the increment silently
    // never happens, every embedding computes to an all-zero vector.
    // Confirmed by comparing the actual compiled bundle's source against
    // this file, not assumed from behavior alone. Splitting into two
    // statements avoids the vulnerable (`?? `-expr) <op> shape entirely,
    // regardless of the exact scope of justc's bug.
    const current = vector[bucket] ?? 0;
    vector[bucket] = current + 1;
  }
  let magnitude = 0;
  for (const v of vector) {
    magnitude += v * v;
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) {
    return vector;
  }
  return vector.map((v) => v / magnitude);
}

// Vectors from computeFakeEmbedding() are already L2-normalized, so
// cosine similarity reduces to a plain dot product.
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}
