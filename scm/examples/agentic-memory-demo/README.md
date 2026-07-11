# agentic-memory-demo

One composition root (`src/app.ts`), compiled unmodified for two targets:
a real browser (`vite build`) and Android (`justc build --bundle --format
iife`, via `js-runtime`'s generator) — same pattern
`scm/examples/cross-target-demo` already proved. Demonstrates
`@justjs/memory`'s pluggable "dummy" provider across three real views
sharing one `FeatureStore` and one `MemoryProvider` instance
(`src/core/memory.ts`):

- **Chat** (`x-chat`, `/chat`) — the assistant recalls prior memories via
  a real `query()` call (semantic + text), not a canned response.
- **Dashboard** (`x-dashboard`, `/dashboard`) — a human inspects,
  filters, edits, and deletes stored memories. The only place tagged
  episodic records get created — chat-authored ones are always untagged
  — which is what makes the two curation heuristics below each demoable
  from a distinct, intentional action instead of colliding on the same
  data.
- **Curation** (`x-curation`, `/curation`) — triggers
  `@justjs/memory`'s `consolidate()` on demand and shows the full
  reasoning/diff of what it did: which episodic notes got merged into a
  structured summary (tag-count based), and which stale untagged notes
  got forgotten outright (age based).

## What's actually exercised

Same real-DDAS-mount rigor as `cross-target-demo`: `router.navigate()`
resolves a `data-ddas-id` placeholder already in the host HTML and a
component's own `render()` inserts into it — no `runtimeAdapter` is
passed to `boot()`, since `MountStep`'s default (`NoopRuntimeAdapter`) is
a genuine no-op on both platforms already.

Unlike `cross-target-demo`'s simpler components, Chat and Dashboard build
their form skeleton once in `connectedCallback` and only re-render their
dynamic region on store changes — all three views share one
`FeatureStore`, so a dispatch from any one of them would otherwise also
fire the others' `subscribe` callbacks and wipe whatever the user was
mid-typing in an unrelated input.

## Bugs found and fixed while building this

1. **`boot()` requires every registered aspect's factory to return
   something with a real `.weave()` method — unconditionally, for every
   concern, not just the six pre-existing ones.** Found the hard way:
   this session's initial design (`MemoryProvider` with no `weave()`)
   passed the earlier, genuinely-generic AC1 validation pass
   (`justjs.providers.has()`), but `boot()`'s *actual* weaving step
   (`application/scm/main/src/core/boot.ts:427-428`,
   `spec.factory() as JustJSAspect; aspect.weave(...)`) throws `TypeError:
   ...weave is not a function` regardless of concern name. Fixed by
   adding a real no-op `weave()` directly to `MemoryProvider`/
   `DefaultMemoryProvider` — `@justjs/memory` doesn't split a `Provider`/
   `Aspect` pair the way the six `aop-*` packages do (there's no
   rendering-pipeline weaving this concern actually needs), so the one
   class satisfies both `boot()`'s requirement and the app-facing CRUD
   contract.
2. **justjs#91 is fixed in `@justjs/memory`, not repeated** —
   `package.json` exports `"./spi"` directly, and `saf/index.ts` imports
   its own `spi/index.js` for the side effect, so a bare
   `import { createMemoryProvider } from "@justjs/memory"` genuinely
   self-registers, unlike the six `aop-*` packages (which still need the
   manual `create*Provider()`-and-register workaround this app's `app.ts`
   applies for those six only).
3. **Two real `justc` (0.3.5) compiler bugs, mobile-only** — `justc`
   silently drops parentheses that group a sub-expression when that
   group is then combined with an *outer* operator, changing evaluation
   order. Both compiled cleanly (`justc build` reported success) and
   passed `bun test` (which never goes through `justc` at all) - only
   surfaced by actually running the compiled app on real hardware and
   checking real output, exactly the class of bug
   `justscript_compiler#3/#13/#14/#15/#16` already document for this
   compiler.
   - `(vector[bucket] ?? 0) + 1` compiled to `vector[bucket] ?? 0 + 1`.
     Since `+` binds tighter than `??`, that's `vector[bucket] ?? (0 + 1)`
     — and since every bucket starts at `0` (not `undefined`), the `??`
     never triggers, so the increment silently never happened. Every
     embedding computed to an all-zero vector on mobile only - chat
     recall always fell through to "Noted — I'll remember that.",
     `getComputedStyle`-verifiable proof (real device, not simulated)
     that this was a genuine runtime effect, not a theory. Fixed by
     splitting into two statements (`fake_embedding.ts`) - avoids the
     vulnerable shape entirely rather than relying on parens `justc`
     might drop.
   - `ageMs / (24 * 60 * 60 * 1000)` compiled to
     `ageMs / 24 * 60 * 60 * 1000`. Since `/` and `*` share precedence
     and are left-associative, that's `((ageMs / 24) * 60) * 60 * 1000`
     — multiplying by ~150,000 instead of dividing by ~86.4 million.
     Manifested as `"last updated 19201800000 days ago"` in a real
     curation log on real hardware. Fixed with a named `MS_PER_DAY`
     constant (`default_memory_provider.ts`) instead of an inline
     parenthesized group.

   Filed as `justscript_compiler#17` and `#18` (real, reproducible
   examples in the report, not just a description).

## A fake-embedding design note

`computeFakeEmbedding()` (pure word-hashing, no ML) was tried first and
*failed* its own test: "jogging" and "running" hash to unrelated buckets,
so genuinely different vocabulary for the same topic scored no better
than actually-unrelated text — confirmed by a real failing assertion, not
assumed correct. Fixed with a small, explicit, curated synonym-to-concept
table (`CONCEPT_SYNONYMS` in `fake_embedding.ts`) mapping known related
words onto the same bucket before hashing. Honest about being a
demo-scale fake, not real NLP — it only helps for the deliberately small
vocabulary it knows about; words outside the table still rely on plain
token overlap.

## Building

```sh
# Web
bun install
bun run build      # -> dist/, or `bun run dev` for a live server
node verify_web.mjs # real-DOM check via happy-dom - boots, mounts via
                     # DDAS, chat recall, dashboard CRUD + semantic
                     # search, curation consolidate + idempotency
VERIFY_FORGETTING=1 node verify_web.mjs # also runs the ~65s
                     # real-time forgetting proof (skipped by default)

# Mobile (from js-runtime's main/features/mobile-bridge/)
bash scripts/generate-android-app.sh \
  /path/to/justjs/scm/examples/agentic-memory-demo/android.manifest.json \
  <output-dir> --install
```
