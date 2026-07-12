# ai-code-editor

One composition root (`src/app.ts`), compiled unmodified for two targets:
a real browser (`vite build`) and Android (`justc build --bundle --format
iife`, via `js-runtime`'s generator) — same pattern
`scm/examples/agentic-memory-demo`/`cross-target-demo` already proved. A
lightweight code editor with real, working AI assistance backed by
Anthropic's Claude via `@justjs/ai-assist` — this ecosystem's first
example built against a real third-party LLM API, not a dummy/heuristic
stand-in.

- **Editor** (`x-editor`, `/editor`) — a file-explorer sidebar (real
  nested folders, `core/fs.ts`) alongside the code buffer: a
  `<textarea>` (transparent text, visible caret) laid directly over a
  regex-highlighted `<pre>` (`core/highlight.ts`), with a synced
  line-number gutter. "✨ Suggest" calls `complete()` with the text
  before/after the cursor and inserts the result. "🔍 Review" calls
  `review()` on the active file and jumps to the Review tab.
- **Chat** (`x-chat`, `/chat`) — a real conversation with Claude, given
  the active file's content as context on every turn via `chat()`.
- **Review** (`x-review`, `/review`) — the last structured `review()`
  result for whichever file it ran against ("Reviewing: `<path>`"):
  severity-badged findings, clickable when they carry a line number
  (jumps back to Editor, switching to that file first if a different one
  is currently open, then selects the line).
- **Scaffold** (`x-scaffold`, `/scaffold`) — two modes. "New File"
  generates one file's content via `scaffold()` and creates it at a given
  path. "New Project" generates a whole small multi-file project via the
  new `scaffoldProject()` (structured multi-file tool-use output, same
  mechanism `review()` uses) and replaces the project wholesale on an
  explicit "Replace project" confirm. Nothing is ever applied
  automatically — creating/replacing is always an explicit tap.

## File explorer — flat path-keyed storage, not a recursive tree

`core/fs.ts` stores the virtual filesystem as `Record<path, FileNode>`
keyed by a `/`-joined path (e.g. `"src/utils/greet.js"`) — folders are
never stored as separate nodes, only inferred at render time by walking
path prefixes (`buildTree()`), the same way git/S3 represent directories.
Rename/delete are string-prefix operations over that flat map
(`isDescendantOrSelf()`, `renamedPath()`), not recursive tree mutation —
deliberately, to keep a class of bug (partial renames, orphaned
sub-trees) structurally impossible rather than something to test for.
Deleting a folder always deletes everything inside it (`rm -rf`
semantics, confirmed inline before it happens — no native `confirm()`
dialog anywhere in this UI, matching this codebase's existing aversion to
blocking dialogs). Rename/create collisions are rejected inline before
dispatch, never a silent last-write-wins overwrite. Persistence is one
debounced (~400ms) `store.subscribe()` in `app.ts`, not scattered calls
across every mutating action — `editor.ts`'s content-edit path dispatches
on every keystroke, and `DefaultFeatureStore` has no batching, so an
undebounced blanket subscribe would stringify the whole project on every
character typed.

## Real security tradeoff, stated plainly

This app calls Anthropic's Messages API directly from browser/WebView JS,
using the documented `anthropic-dangerous-direct-browser-access: true`
opt-in header. That header exists specifically because this pattern is
discouraged outside personal/local tools: the API key lives in
`localStorage` and is sent in every request, visible to anyone inspecting
network traffic on the page. Every example app in this series is
local-only with no backend to proxy the call through, so this is an
accepted, understood tradeoff for a demo — not an oversight. The key is
entered by the user in the settings sheet (gear icon), stored in
`localStorage` only, never hardcoded or committed. The settings sheet
discloses this in-product, not just here.

## No streaming — a real UX consequence, not a silent limitation

`@justjs/network`'s `FetchAdapter` has no streaming support anywhere in
this codebase (`DefaultFetchAdapter.fetch()` fully buffers via `await
res.text()`, no `ReadableStream` path). Every AI response — completion,
chat reply, review, scaffold — arrives as one blocking wait with no
incremental/token-by-token display. This is also why completions are
button-triggered ("✨ Suggest"), not live-as-you-type ghost text: without
streaming, live-as-you-type would mean a blocking API call on every pause
in typing.

## Why a hand-rolled editor, not CodeMirror/Monaco

No example app in this ecosystem has ever pulled a real third-party npm
dependency through `justc`'s bundler for the Android target. Two real
open `justc` bugs make that a genuinely untested risk for a
multi-package dependency graph like CodeMirror 6's: `--bundle` is a
no-op for `--target js` (`justscript_compiler#4`), and non-JS/TS imports
like CSS are silently dropped with no warning (`justscript_compiler#5`).
The regex-based syntax highlighting this app uses instead
(`core/highlight.ts`) is the same tokenizing technique
(`text.match(/pattern/g)`) already proven to compile correctly through
`justc` for Android in `@justjs/memory`'s own `fake_embedding.ts` — it
carries none of that risk.

## Why `aiAssist` is never listed in `boot()`'s `aspects` config

`boot()`'s weave loop only calls `spec.factory()` for concerns actually
present in the `aspects` object passed to `boot()`
(`application/scm/main/src/core/boot.ts`) — and it always calls that
factory with **zero arguments**, regardless of what config the app
supplied elsewhere. `@justjs/memory`'s `MemoryProviderConfig` is fully
optional, so that's harmless for it. `AiAssistProviderConfig.apiKey` is
required — listing `aiAssist` in `aspects` would call
`@justjs/ai-assist`'s SPI factory with no key and throw synchronously
inside `boot()`, crashing the app. This app's real singleton
(`core/ai_assist.ts`'s `getAiAssistProvider()`) is built directly via
`createAiAssistProvider(config)` with a real config instead, imported
directly by every component — the same "throwaway weave-only instance
vs. the real singleton the app actually uses" pattern
`agentic-memory-demo/src/core/memory.ts` already established for
`@justjs/memory`.

## Verification status — honest, not inflated

**Verified:** `@justjs/ai-assist`'s `bun test` passes 19/19 (includes
`scaffoldProject()`'s structured-output parsing, truncation handling via
`stop_reason`, and duplicate/malformed-file rejection). `vite build`
succeeds; `node verify_web.mjs` (real DOM via happy-dom against the real
built bundle) passes all 51 assertions — boot, DDAS mounting into all
four routes, the starter tree rendering real nested folders with the
active file's ancestors auto-expanded, the regex highlighter tokenizing
keywords/numbers, file switching, create/rename/delete for both files and
folders (including collision rejection and the folder-with-real-files
cascade-delete confirmation copy), a cross-file jump-to-line dispatched
through the real event bus `review.ts` would use, the settings sheet's
API-key save/clear/status round-trip through `localStorage`, every AI
action (Suggest, Review, both Scaffold modes, Chat) failing loudly with a
real, actionable "add an API key" message when none is configured, and
the whole project's real `localStorage` persistence round-trip. Full root
`bun run build`/`typecheck`/`test` also passes clean across every sibling
package — no regression introduced elsewhere.

**Not verified by the fast default path:** an actual authenticated call
to Anthropic. `verify_web.mjs` has an opt-in live-call section gated
behind `AI_CODE_EDITOR_LIVE_TEST=1` **and** a real `ANTHROPIC_API_KEY`
env var (costs a real, billed API call — skipped by default, same
pattern as `agentic-memory-demo`'s `VERIFY_FORGETTING=1`).

**Not verified at all yet:** real Android hardware. This would be the
first authenticated third-party POST from the Android target in this
ecosystem. `cross-target-demo/README.md` already documents one
real-device-only failure mode for network calls on this exact stack
(Doze/App Standby blocking background fetch, fixed by waking the screen
and foregrounding the app before retry) — a similar or different failure
mode for this specific call is plausible and unconfirmed. Whether
Android's WebView JS engine honors the
`anthropic-dangerous-direct-browser-access` CORS opt-in identically to
desktop Chrome is also genuinely unconfirmed. `android.manifest.json`
declares `"capabilities": []` since INTERNET is unconditional in
js-runtime's manifest template (not capability-gated,
`cross-target-demo/README.md`) — no js-runtime changes are needed to
build the Android target, but building is not the same as verifying the
real call works on-device. A dedicated real-hardware pass with a real API
key is required before calling the Android target done.

## Building

```sh
# Web
bun install
bun run build      # -> dist/, or `bun run dev` for a live server
node verify_web.mjs # real-DOM check via happy-dom - boot, DDAS mounting,
                     # highlighting, tab switching, settings API-key
                     # round-trip, every AI action's no-key error state
AI_CODE_EDITOR_LIVE_TEST=1 ANTHROPIC_API_KEY=sk-ant-... node verify_web.mjs
                     # also exercises one real, billed Suggest call
                     # (skipped by default)

# Mobile (from js-runtime's main/features/mobile-bridge/) - builds only,
# NOT yet verified against a real Anthropic call on real hardware (see
# "Verification status" above)
bash scripts/generate-android-app.sh \
  /path/to/justjs/scm/examples/ai-code-editor/android.manifest.json \
  <output-dir> --install
```
