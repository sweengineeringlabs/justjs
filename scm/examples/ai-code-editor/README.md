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
- **Workspace** (`x-workspace`, `/workspace`) — an SDLC hub: 9 widgets
  (the 8 SDLC stages — Ideation, Requirement, Planning, Design,
  Development, Testing, Deployment, Operations — plus Presentation),
  same widget-grid-then-drill-down architecture `agentic-memory-demo`'s
  Memories tab established. Four stages link to real, working tabs this
  app already has — Ideation→Chat, Planning→Scaffold, Development→Editor,
  Testing→Review. **Design**'s two entries, Architecture and Wireframes,
  are both real (not stubs) — both open the same inline capability
  (below), since one generated doc genuinely covers both. **Deployment**'s
  Cloud entry is also real (not a stub) — a fixed catalog of actual,
  recognizable cloud providers (AWS, Google Cloud, Microsoft Azure,
  DigitalOcean, Cloudflare, Vercel, Netlify, Heroku) to toggle on/off, not
  a free-text "type any name" list — no real cloud API calls or
  credentials either way. **Presentation**'s Slides entry is also real
  (not a stub) — an AI-generated slide deck (below), opened directly
  since it's the stage's only function (unlike Design's two entries
  sharing one generator). **Development**'s CLI entry is also real (not
  a stub) — a real terminal against this app's own virtual filesystem
  (below), not an AI-backed interpreter and not a real OS shell.
  Development's Repository, and Requirement/Operations, show their
  entries as honestly-labeled "Coming soon" stubs, not fake-functional
  buttons.

## Design — Markdown + Mermaid doc generator

Design's Architecture and Wireframes entries both open the same real,
inline generator — a new `generateDesignDoc()` capability (own prompt,
not `scaffold()` reused — `scaffold()` explicitly tells Claude to omit
markdown fences, which fights intentionally emitting a ` ```mermaid `
one) that produces a Markdown document with an embedded Mermaid diagram
from a description, with an Edit/Preview toggle (Edit: raw source,
editable; Preview: rendered HTML + diagram) and a "Create file" action
that reuses the real file explorer's collision check (`core/fs.ts`'s
`pathExists()`) exactly like Scaffold's own "Create file" flow —
generated docs land in the real project, not a dead end. Tapping either
Architecture or Wireframes opens the exact same generator with whatever
was last generated still there (not two separate, half-built copies) —
`workspace.ts`'s own drill-down goes one level deeper here than every
other stage (Workspace → Design's Architecture/Wireframes list → the
shared generator), since two distinct entries both needed to lead
somewhere real.

**This is the first real third-party npm dependency (`mermaid`, pinned
exact at `11.16.0`) in any example app in this repo** — a deliberate,
acknowledged reversal of the line this app's own "Why a hand-rolled
editor" section draws (every dependency across all four example apps
before this was `@justjs/*` plus dev-only tooling). Mermaid's real SVG
diagram rendering has no reasonable hand-rolled equivalent, unlike
`core/highlight.ts`'s regex syntax highlighter.

**The import is never static.** `import mermaid from "mermaid"` never
appears as a top-level import anywhere reachable from `app.ts`. This app
is one composition root compiled unmodified for both `vite build` (web)
and `justc build --bundle --format iife` (Android), and every route
mounts eagerly at boot — a static import would execute at module-
evaluation time on **both** targets regardless of whether Design is ever
opened, and given `justscript_compiler#4` (`--bundle` a no-op for
`--target js`), that risks taking down the app's *entire* Android boot,
not just gracefully degrading one feature. `core/markdown.ts` instead
uses a lazy `await import("mermaid")` inside the one function that
actually renders a diagram, wrapped in try/catch — confirmed via a real
build that Vite code-splits it into its own lazily-loaded chunks (the
main `index-*.js` entry stays ~88KB; `mermaid.core-*.js` and dozens of
per-diagram-type chunks, several hundred KB combined, load only when
Design's Preview is actually used).

**`happy-dom` (this app's `verify_web.mjs` test environment) genuinely
cannot render Mermaid** — confirmed via research, not assumed: Mermaid
depends on `SVGTextElement.getBBox()` for text measurement, which
DOM-emulation libraries don't implement meaningfully; Mermaid's own
maintainers point headless/server-side users at Puppeteer (a real
browser engine) for exactly this reason. `core/markdown.ts` catches this
and falls back to the raw ` ```mermaid ` source plus a "couldn't be
rendered in this environment" note — required for the app to degrade
gracefully in any constrained environment, not just for the test suite.
`verify_web.mjs` asserts this real fallback path (via a temporary fake
API key + a mocked `globalThis.fetch` returning a canned Anthropic-
shaped response — not a real network call, but real app logic:
`generate()` → Edit/Preview toggle → real dynamic `import("mermaid")` →
real attempted render → real fallback → "Create file" reusing the real
collision check), not a hand-waved assumption that rendering works.

**Real Mermaid SVG rendering in an actual browser has not been visually
confirmed this session** — the Chrome browser-automation tooling wasn't
connected in this environment. This is a genuine, stated gap, not a
silent assumption: before calling this feature fully done, open
`bun run dev`, add a real Anthropic API key in Settings, generate a
design doc, and confirm Preview shows a real rendered diagram (not just
that the fallback note correctly *doesn't* appear).

## Deployment — Cloud providers catalog

Deployment's Cloud entry is real, not a stub: a fixed catalog of actual,
recognizable cloud providers (AWS, Google Cloud, Microsoft Azure,
DigitalOcean, Cloudflare, Vercel, Netlify, Heroku — `workspace.ts`'s
`CLOUD_PROVIDER_CATALOG`), each rendered as a card with its own icon and
name. Tapping a card toggles it on/off (an "Added" badge and an
accent-colored border mark a selected card) — a real multi-select, not a
free-text "type any name" list that could hold anything. There is still
no real cloud API integration — no credentials are collected or stored,
matching this app's established security posture around the Anthropic
API key; toggling a provider on just means "listed," not "connected."
Git, previously listed here, moved to Development's "Repository" entry
(also a stub — a repository is a development-stage concern, not a
deployment one).

## Presentation — AI-generated slide deck

Presentation's Slides entry is real, not a stub: a new
`generateSlides()` capability on `@justjs/ai-assist` (own dedicated
prompt, not `generateDesignDoc()` reused — a deck needs terse per-slide
bullets rather than document prose, and a diagram is optional per slide
rather than mandatory once overall) producing a Markdown deck with
slides separated by a bare `---` line — the real convention Marp/
reveal-md use, so the generated `slides.md` is a genuinely useful file
outside this app too, not an app-internal format. Unlike Design's
Architecture/Wireframes (two entries sharing one generator), Slides is
the stage's only function, so tapping it opens the generator directly.

Preview shows **one slide at a time**, not a continuous scroll like
Design's — `core/markdown.ts`'s new `splitMarkdownSlides()` splits the
raw source into per-slide chunks at a bare `---` line before any
rendering happens, fence-aware (a `---` inside a slide's own code sample
is never mistaken for a slide break, reusing the same
`FENCE_PATTERN`/`CLOSING_FENCE_PATTERN` `splitBlocks()` already tracks
fence state with). The split pattern is deliberately narrower than
`renderTextBlock()`'s own `<hr>` regex (exactly 3 dashes, not 3-or-more
or `***`) — the prompt reserves bare `---` exclusively for slide breaks
and tells the model to use `----` for an actual in-slide rule, so a real
Design doc's genuine `<hr>` is untouched and `renderMarkdownToHtml()`
itself stays completely slide-agnostic, called once per slide chunk
rather than ever being taught about slides at all. Prev/Next buttons and
a "Slide X of N" indicator drive `currentSlideIndex`; switching slides
re-runs `renderMarkdownToHtml()` for just that slide, guarded by its own
`slidesRenderToken` (independent from Design's `designRenderToken` —
these are two parallel drill-downs, each with its own in-flight async
Mermaid render to guard against a fast Next/Prev tap or a regenerate
mid-render).

A genuinely useful finding from testing this against real `mermaid.render()`
calls in `happy-dom`, not just assumed: **not every Mermaid diagram type
fails the same way in `happy-dom`.** Design's own test uses a
`sequenceDiagram` (confirmed to reliably throw, due to `getBBox()`, and
correctly hit the fallback path). A `flowchart` diagram, tried while
building this feature's own test, does **not** throw — but also doesn't
produce a well-formed `<svg>` wrapper (`mermaid.render()` resolves
successfully with content that's missing its own root `<svg>` tag). That
third outcome wasn't something `renderMermaidBlock()`'s `try`/`catch`
could detect on its own (it only catches thrown errors) - fixed by
validating the resolved `svg` string structurally (`isWellFormedSvg()`,
`core/markdown.ts`: trimmed content must start with `<svg` and end with
`</svg>`) and throwing when it isn't, routing malformed-but-resolved
output into the exact same fallback a thrown error hits. `verify_web.mjs`'s
Slides test proves both paths now - slide 2 (`sequenceDiagram`, throws
directly) and slide 3 (`flowchart`, resolves but gets rejected by
`isWellFormedSvg()`) both correctly show the fallback note, not broken or
partial markup.

## Development — CLI (a real virtual-filesystem shell)

Development's CLI entry is real, not a stub: a new `core/cli.ts` module
(`runCliCommand(rawLine, cwd, files, emptyFolders)`, pure - no state, no
dispatch) running a bounded command set against this app's own virtual
filesystem — the exact same `FileMap`/`emptyFolders` the file explorer
already manages, not a parallel, fake one. Not an AI-backed interpreter,
and not a real OS shell — this app is browser-only with no backend to
shell out to.

Commands: `pwd`, `ls [path]`, `cd [path]`, `cat <path>`, `mkdir <path>`,
`touch <path>`, `rm [-r] <path>`, `mv <src> <dest>`, `cp <src> <dest>`,
`grep <pattern> [path]`, `find [path] [-name pattern]`, `echo <text>`,
`ssh <host>`, `help`, `clear`. Each mutating command returns a real
`AppAction` (`CREATE_FILE`/`CREATE_FOLDER`/`RENAME_PATH`/`COPY_PATH`/
`DELETE_PATH`) that `workspace.ts` dispatches into the real store —
running `mkdir` in the terminal makes the same folder show up in the
Editor's real file tree, not a terminal-only illusion. A few deliberate,
real-shell-faithful behaviors rather than shortcuts: `touch` on an
already-existing file is a silent no-op (this virtual filesystem has no
mtime field for `touch` to legitimately bump, and re-creating the file
would clobber real content with an empty string); `mv`/`cp file
existing-dir/` moves/copies into that directory under its own basename,
the single most-reached-for real invocation of either; `mv`/`cp` both
refuse to move/copy a folder into itself or its own descendant (`cannot
move/copy into itself`) — the underlying `RENAME_PATH`/`COPY_PATH`
reducers would otherwise silently produce a corrupted, double-nested
duplicate, since the file explorer's own rename UI can never trigger
this case (it only ever renames within the same parent, never to an
arbitrary destination elsewhere in the tree the way `mv`/`cp` can).
`COPY_PATH` (`core/state.ts`) is a new reducer action mirroring
`RENAME_PATH`'s exact structure but additive rather than replacing — the
source entries stay exactly where they are, copies are added alongside
them. `grep`/`find` returning zero matches is a real, honest empty
result, not an error — the same convention real `grep`/`find` use.
`echo` has no `>` redirection — a deliberate scope cut, not an
oversight. `clear` is a client-side terminal built-in (wipes the local
transcript) rather than a real filesystem command, matching how real
terminal emulators handle it — it never reaches `core/cli.ts` at all.

**`ssh` is a deliberately honest error, not a fake connection.** A
browser page cannot open a raw TCP socket at all — the only network
primitives the web platform exposes are `fetch`/`XHR` (HTTP(S) only) and
`WebSocket` (needs a WebSocket server on the other end, not an arbitrary
TCP service). Even real "web SSH" terminals (the kind cloud consoles
ship) don't run SSH in the browser either — they relay bytes over a
WebSocket to a real backend that opens the actual SSH connection
server-side. This app has no backend at all (same reason the Anthropic
API key is called directly from the browser instead of through a proxy
— see below), so even that relay pattern has nothing to connect to
here. `ssh` prints an honest "not available" error explaining exactly
why, rather than a pretend connection.

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

`boot()`'s weave loop now forwards `aspects[concern].config` to the
resolved strategy's `spec.factory()` (`AspectConfig.config`,
`application/scm/main/src/core/boot.ts`) — so this is no longer a hard
blocker the way it originally was. This app still builds its real
singleton (`core/ai_assist.ts`'s `getAiAssistProvider()`) directly via
`createAiAssistProvider(config)` instead of through `boot()`'s `aspects`,
because the API key is loaded from `localStorage` *after* boot, not known
at boot time — `boot()`'s `aspects` config has no path for a value that
only exists once the app is already running. Same "throwaway weave-only
instance vs. the real singleton the app actually uses" pattern
`agentic-memory-demo/src/core/memory.ts` established for `@justjs/memory`,
just for a different reason now.

## Real navigation, not just a boot-time proof

Every route in `ROUTES` gets a real `justjs.router.navigate()` call once
at boot (proving the real Mount/Render/Update pipeline runs against every
route, not a narrated stand-in — the same pattern
`agentic-memory-demo`/`cross-target-demo` established). Every navigation
*after* boot — a nav-bar tap, or a component's own `navigateTo()` call —
also goes through a real `justjs.router.navigate()` call now (`app.ts`'s
`goToRoute()`), not just the boot-time loop. This used to rely purely on
a hand-rolled CSS `.active` toggle for every post-boot navigation, which
left `Router.currentPath()` permanently stuck on whichever route was last
in the boot loop, and ADR-0004's reactive re-render subscription wired to
that same stale route instead of whichever tab the user actually had
open. Calling `navigate()` for real on every navigation doesn't lose any
component state: each route resolves to its own distinct DDAS container,
and `adaptCustomElementRegistry()`'s `render()` reuses the existing
custom-element instance rather than recreating it, so nothing here is
destructive. `showRoute()`'s CSS toggle still exists alongside
`goToRoute()` for a separate, genuinely different concern — which
container is visually shown — since `Router` has no notion of hiding
inactive routes at all.

## Verification status — honest, not inflated

**Verified:** `@justjs/ai-assist`'s `bun test` passes 24/24 (includes
`scaffoldProject()`'s structured-output parsing, truncation handling via
`stop_reason`, duplicate/malformed-file rejection, the three
image-content-block tests for `chat()`/`review()`/`scaffoldProject()`,
`generateDesignDoc()`'s prompt/model/max_tokens shape, and
`generateSlides()`'s prompt/model/max_tokens shape). `vite build`
succeeds and confirms real code-splitting (the main entry stays ~88KB;
`mermaid` and its per-diagram-type chunks load lazily, several hundred
KB combined, only when Design's or Presentation's Preview is actually
used); `node verify_web.mjs` (real DOM via happy-dom against the real
built bundle) passes all 190 assertions — boot, DDAS mounting into all
five routes, the Workspace hub's 9 widgets (the 8 SDLC stages in order,
plus Presentation) drilling into real live links vs. honestly-labeled
stubs correctly, Deployment's Cloud providers catalog (toggling real,
recognizable providers on/off individually, no "Git" label anywhere
anymore), Design's Architecture and Wireframes both opening the same
real generator (with the same in-progress doc, not two separate copies)
and its
generate→Edit/Preview→Mermaid-fallback→Create-file flow via a mocked-
fetch/real-app-logic technique (no real network call, but the real
dynamic `import("mermaid")`, the real attempted render, and the real,
confirmed-necessary fallback all genuinely execute), Presentation's
Slides opening its generator directly (a single real function, not two
entries sharing one) with the same generate→Edit/Preview→Create-file
flow proved slide-by-slide — real per-slide splitting (slide 2's content
never appears while slide 1 is showing), the nav indicator and Prev/Next
disabled-state tracking the real slide count and position, and both real
mermaid-fallback paths proved per-slide (a `sequenceDiagram` that throws
directly, and a `flowchart` that resolves but gets rejected by
`isWellFormedSvg()`'s structural check, both landing on the same honest
fallback note rather than broken markup), Development's CLI running a
real command sequence against the real virtual filesystem (`pwd`/`ls`/
`cd`/`cat`/`mkdir`/`touch`, including the no-clobber-on-an-existing-file
proof/`rm`(`-r`)/`mv`/`cp` including the move-and-copy-into-directory
expansion and the move/copy-into-itself guards/`grep` finding a real
match with real `file:line:content` output and a real, honest empty
result on no match/`find` locating a real path by `-name` and listing a
real subtree with no filter/`ssh`'s honest "not available" error/an
unknown-command error/`clear`), each mutating command's effect confirmed
in the real file tree, not just the terminal's own transcript, the
starter tree rendering real nested
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
pattern as `agentic-memory-demo`'s `VERIFY_FORGETTING=1`). Also not
verified: real Mermaid SVG rendering in an actual browser (see "Design —
Markdown + Mermaid doc generator" above) — `happy-dom` genuinely cannot
render it, so the fast path only proves the fallback path works, not
that a real diagram renders when Mermaid genuinely can run.

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
