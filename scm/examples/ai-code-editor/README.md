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
  the active file's content as context on every turn via `chat()`. Press-
  and-hold the mic to dictate instead of typing (auto-sends on release).
  Attach a screenshot (📷) and Claude actually sees it — real vision
  input, not just local display — e.g. "what's wrong with this error".
- **Review** (`x-review`, `/review`) — the last structured `review()`
  result for whichever file it ran against ("Reviewing: `<path>`"):
  severity-badged findings, clickable when they carry a line number
  (jumps back to Editor, switching to that file first if a different one
  is currently open, then selects the line). Can also attach a screenshot
  before running — e.g. "here's the error this throws".
- **Scaffold** (`x-scaffold`, `/scaffold`) — two modes. "New File"
  generates one file's content via `scaffold()` and creates it at a given
  path. "New Project" generates a whole small multi-file project via the
  new `scaffoldProject()` (structured multi-file tool-use output, same
  mechanism `review()` uses) and replaces the project wholesale on an
  explicit "Replace project" confirm. Nothing is ever applied
  automatically — creating/replacing is always an explicit tap. Both
  description fields support voice dictation (no auto-Generate on
  release, unlike Chat — Generate is a deliberate, sometimes-costly
  action); only New Project also accepts a screenshot ("build this from
  this mockup").

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

## Voice input and real vision AI — reused, not reinvented, with two deliberate cuts

Voice (`core/speech.ts`) and the image-attach mechanics (`core/images.ts`)
are ported from `agentic-memory-demo`'s own `core/speech.ts`/
`core/images.ts`, not written from scratch. Two scope cuts, stated
plainly rather than silently omitted: this app only ported
`isVoicePromptSupported()`/`startVoicePrompt()`/`describeVoiceError()` —
not `agentic-memory-demo`'s paginated voice-language picker or its
text-to-speech (read-aloud) support. Voice input here always falls
through to `navigator.language`, with no in-app override.

Screenshots are genuinely new territory for this ecosystem, not a port:
`agentic-memory-demo`'s images are local-only (`FileReader` → data URL →
`<img>` display, never sent anywhere). Here, an attached screenshot is
real vision input — split into `{mediaType, base64Data}`
(`core/images.ts`'s `parseDataUrl()`) and sent as an Anthropic image
content block via a new `ImageAttachment` type and `toAnthropicContent()`
helper in `@justjs/ai-assist`. Client-side validation (unsupported type,
or over `core/images.ts`'s 4MB cap — comfortably under Anthropic's real
~5MB-after-base64-encoding limit) rejects a bad file at the file-picker
`change` event, before `FileReader` ever runs, with a real inline error
instead of a confusing 400 from Anthropic seconds later.

Screenshot attachment is one-shot everywhere: attach → run the action
(send/review/generate) → cleared, regardless of success or failure —
same as how the chat text input already cleared immediately on send
before this feature existed. A real bug caught by `verify_web.mjs`
during development: Review's and Scaffold's image-clearing calls were
originally placed *after* the "no API key configured" early return, so a
failed attempt silently left the attachment behind — fixed by clearing
before that check, matching the ordering `chat.ts` already had right.

## Android — voice/vision are web-verified only, not shipped as Android-ready

`agentic-memory-demo/android.manifest.json` lists `"voice"`/`"image"` in
its `capabilities` array, but neither string appears anywhere else in
this checked-out repo — not in `docs/6-deployment/playbook.md`'s
documented seven capabilities (`echo`, `notify`, `biometricAuth`,
`contacts`, `camera`, `health`, `location`), not in
`platform/mobile/scm/main/src/api/bridge.ts`'s independently-
corroborated same seven. `js-runtime` itself isn't checked out here to
confirm what (if anything) an unrecognized capability string grants, but
two non-stale sources agreeing, against zero supporting plumbing for
either string, means treating `agentic-memory-demo`'s manifest as proof
this works on Android would be the wrong inference. This app's
`android.manifest.json` deliberately keeps `"capabilities": []` — voice
input and screenshot attachment are built and verified against the
web/dev-server target only. `isVoicePromptSupported()` degrades
gracefully on Android the same way it does anywhere without
`SpeechRecognition` (the mic button just doesn't render); the file-input-
based screenshot attach UI will render on Android regardless, but tapping
it may not open a working native picker without the right capability
wired. Real Android verification for either feature is unconfirmed and
explicitly out of scope for this pass.

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

**Verified:** `@justjs/ai-assist`'s `bun test` passes 22/22 (includes
`scaffoldProject()`'s structured-output parsing, truncation handling via
`stop_reason`, duplicate/malformed-file rejection, and the three new
image-content-block tests for `chat()`/`review()`/`scaffoldProject()`).
`vite build` succeeds; `node verify_web.mjs` (real DOM via happy-dom
against the real built bundle) passes all 74 assertions — boot, DDAS
mounting into all four routes, the starter tree rendering real nested
folders with the active file's ancestors auto-expanded, the regex
highlighter tokenizing keywords/numbers, file switching, create/rename/
delete for both files and folders (including collision rejection and the
folder-with-real-files cascade-delete confirmation copy), a cross-file
jump-to-line dispatched through the real event bus `review.ts` would use,
the settings sheet's API-key save/clear/status round-trip through
`localStorage`, mic buttons correctly absent given happy-dom's genuine
lack of `SpeechRecognition` (confirmed directly, not assumed), a real
screenshot attach/preview/wrong-type-rejection/oversized-rejection/
remove/clear-after-use flow on Chat/Review/Scaffold-New-Project via a
real `File`+`DataTransfer`+`change` event (same technique
`agentic-memory-demo/verify_web.mjs` already uses), every AI action
(Suggest, Review, both Scaffold modes, Chat — with and without an
attached screenshot) failing loudly with a real, actionable "add an API
key" message when none is configured, and the whole project's real
`localStorage` persistence round-trip. Full root `bun run build`/
`typecheck`/`test` also passes clean across every sibling package — no
regression introduced elsewhere.

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
key is required before calling the Android target done. Voice input and
screenshot attachment specifically are not even expected to work on
Android yet — see "Android — voice/vision are web-verified only" above.

## Building

```sh
# Web
bun install
bun run build      # -> dist/, or `bun run dev` for a live server
node verify_web.mjs # real-DOM check via happy-dom - boot, DDAS mounting,
                     # highlighting, tab switching, file explorer,
                     # settings API-key round-trip, real screenshot
                     # attach/reject/clear flows, every AI action's
                     # no-key error state (with and without an image)
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
