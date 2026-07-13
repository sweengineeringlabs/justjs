// Real DOM verification (not just "the bundle compiled") - happy-dom is
// already trusted by this codebase for the same purpose (see
// agentic-memory-demo/verify_web.mjs, which established this pattern for
// example apps in this repo). Loads the real Vite-built bundle against a
// real data-ddas-id-bearing DOM matching index.html's markup, and checks
// actual post-boot state.
//
// core/ai_assist.ts's getAiAssistProvider() is lazy - it only constructs
// a real AnthropicAiAssistProvider (and only then touches
// createApiAdapter/createFetchAdapter) when a component calls it with a
// non-empty stored API key. The default fast path below never sets a
// key, so no real network call is ever attempted - it proves every AI
// action's "no API key configured" error state instead, plus the entire
// file-explorer (create/rename/delete/collision, cross-file jump-to-line
// via a direct x-jump-line event - the same event bus a real review
// finding click uses) without needing one. The globalThis.fetch capture/
// restore trick is still applied, matching agentic-memory-demo/
// verify_web.mjs, so the opt-in live-call path below (gated behind
// AI_CODE_EDITOR_LIVE_TEST=1 + a real ANTHROPIC_API_KEY) can reach the
// real network when explicitly requested.
import { Window } from "happy-dom";
import { readdirSync } from "fs";

const nodeFetch = globalThis.fetch;

const window = new Window({ url: "http://localhost/" });
const document = window.document;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) {
    try {
      globalThis[key] = window[key];
    } catch {
      // Some window globals are getter-only accessors on globalThis
      // already (e.g. `self`) - skip rather than fail the whole setup.
    }
  }
}
globalThis.window = window;
globalThis.document = document;
globalThis.fetch = nodeFetch;

document.body.innerHTML = `
  <div id="app">
    <header class="app-header">
      <div class="brand">
        <h1>AI Code Editor</h1>
        <button id="settings-btn" type="button">Settings</button>
        <button id="theme-toggle-btn" type="button"></button>
      </div>
    </header>
    <nav class="nav">
      <button class="nav-btn active" data-route="/editor">Editor</button>
      <button class="nav-btn" data-route="/chat">Chat</button>
      <button class="nav-btn" data-route="/review">Review</button>
      <button class="nav-btn" data-route="/scaffold">Scaffold</button>
      <button class="nav-btn" data-route="/workspace">Workspace</button>
    </nav>
    <!-- data-ddas-id is stamped at runtime by the real bundle's stampMounts()
         call (src/mounts.gen.ts, justweb.toml's [mounts]), not seeded here -
         matches index.html, see justjs#95. -->
    <div id="mount-editor" class="page active"></div>
    <div id="mount-chat" class="page"></div>
    <div id="mount-review" class="page"></div>
    <div id="mount-scaffold" class="page"></div>
    <div id="mount-workspace" class="page"></div>
    <div id="settings-panel" hidden>
      <div id="settings-backdrop"></div>
      <div class="settings-sheet">
        <div class="settings-sheet-header">
          <h2>Anthropic API key</h2>
          <button id="settings-close-btn" type="button">close</button>
        </div>
        <input id="settings-api-key" type="password" />
        <button id="settings-api-key-save" type="button">Save</button>
        <button id="settings-api-key-clear" type="button">Clear</button>
        <p id="settings-api-key-status"></p>
      </div>
    </div>
  </div>
`;

// Matches Vite's own naming convention for the main entry chunk
// specifically (index-<hash>.js) - a bare ".js" suffix match was enough
// back when this app's own code was the only thing in dist/assets/, but
// mermaid's lazy-loaded diagram-type chunks now put dozens of other .js
// files there too, and fs.readdirSync's order isn't guaranteed to put
// the real entry first.
const distFile = readdirSync("./dist/assets").find((f) => /^index-.*\.js$/.test(f));
const bundlePath = `./dist/assets/${distFile}`;
console.log("loading bundle:", bundlePath);
await import(new URL(bundlePath, import.meta.url).href);
await new Promise((r) => setTimeout(r, 200));

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`ok: ${message}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// A flat sleep doesn't fit real Mermaid rendering - the dynamic
// import("mermaid") loads a genuinely large module graph (d3, cytoscape,
// katex, ...) from disk, and how long that takes isn't a small, bounded
// margin the way a FileReader read or a DOM update is. Poll instead of
// guessing a bigger fixed number.
async function waitUntil(predicate, timeoutMs = 15_000, intervalMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

function treeRow(path) {
  return document.querySelector(`.tree-row[data-path="${path}"]`);
}

// 1. Boot proof
assert(document.title === "ai-code-editor: mounted", `document.title is "${document.title}"`);
assert(document.getElementById("mount-editor").innerHTML.length > 0, "editor mount has content");
assert(document.getElementById("mount-chat").innerHTML.length > 0, "chat mount has content");
assert(document.getElementById("mount-review").innerHTML.length > 0, "review mount has content");
assert(document.getElementById("mount-scaffold").innerHTML.length > 0, "scaffold mount has content");
assert(document.getElementById("mount-workspace").innerHTML.length > 0, "workspace mount has content");

// 1b. Workspace hub proof - the widget-grid-then-drill-down SDLC hub.
// Functions with a real backing tab (Ideation->Chat, Planning->Scaffold,
// Development->Editor, Testing->Review) are live links; the rest are
// honestly-labeled stubs, not fake-functional buttons.
document.querySelector('.nav-btn[data-route="/workspace"]').click();
const workspaceWidgets = [...document.querySelectorAll('#mount-workspace [data-stage]')];
assert(workspaceWidgets.length === 9, `the workspace overview shows exactly 9 widgets - the 8 SDLC stages plus Presentation (found ${workspaceWidgets.length})`);
assert(
  workspaceWidgets.map((w) => w.dataset.stage).join(",") ===
    "ideation,requirement,planning,design,development,testing,deployment,operations,presentation",
  "the 8 SDLC-stage widgets are in order, with Presentation appended after them"
);

document.querySelector('#mount-workspace [data-stage="presentation"]').click();
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace-stage-title").textContent.includes("Presentation"),
  "Presentation drills into its own detail view like every other widget"
);
assert(
  document.querySelector("#mount-workspace .workspace-function-live .workspace-function-label")?.textContent === "Slides",
  "Presentation shows Slides as a real, live function, not a stub - full generator flow proved in section 1d below"
);
document.querySelector("#workspace-back-btn").click();
await sleep(20);

document.querySelector('#mount-workspace [data-stage="deployment"]').click();
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace-stage-title").textContent.includes("Deployment"),
  "drilling into a widget shows that stage's detail view"
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "Deployment has no stubs left - Git moved to Development's Repository, and Cloud is now real");
const deploymentFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  deploymentFunctions.length === 1 && deploymentFunctions[0].textContent.includes("Cloud"),
  `Deployment shows exactly one real function, Cloud (found ${deploymentFunctions.map((el) => el.textContent).join(" | ")})`
);

// Cloud providers: a real, recognizable catalog of actual cloud
// providers (not a free-text "type any name" list) - tapping a card
// toggles it on/off, no real cloud API calls or credentials.
deploymentFunctions[0].click();
await sleep(20);
const providerCards = [...document.querySelectorAll("#mount-workspace .cloud-provider-card")];
const providerNames = providerCards.map((el) => el.querySelector(".cloud-provider-name").textContent);
assert(
  providerNames.includes("AWS") && providerNames.includes("Microsoft Azure") && providerNames.includes("Google Cloud"),
  `Cloud opens a real catalog of actual, recognizable providers (found ${providerNames.join(", ")})`
);
assert(providerCards.every((el) => !el.classList.contains("selected")), "no provider is selected by default");

const awsCard = providerCards.find((el) => el.querySelector(".cloud-provider-name").textContent === "AWS");
awsCard.click();
await sleep(20);
assert(document.querySelector('[data-provider-id="aws"]').classList.contains("selected"), "tapping a provider card selects it");
assert(document.querySelector('[data-provider-id="aws"] .cloud-provider-check').textContent.includes("Added"), "a selected card shows an 'Added' badge");

const gcpCard = document.querySelector('[data-provider-id="gcp"]');
gcpCard.click();
await sleep(20);
assert(
  document.querySelector('[data-provider-id="aws"]').classList.contains("selected") &&
    document.querySelector('[data-provider-id="gcp"]').classList.contains("selected"),
  "selecting a second provider doesn't deselect the first"
);

document.querySelector('[data-provider-id="aws"]').click();
await sleep(20);
assert(
  !document.querySelector('[data-provider-id="aws"]').classList.contains("selected") &&
    document.querySelector('[data-provider-id="gcp"]').classList.contains("selected"),
  "tapping a selected card again deselects just that one"
);

document.getElementById("cloud-back-btn").click();
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace-function-live")?.textContent.includes("Cloud"),
  "Cloud's own back button returns to Deployment's function list, not the Workspace overview"
);

document.querySelector("#workspace-back-btn").click();
await sleep(20);
assert(
  document.querySelectorAll('#mount-workspace [data-stage]').length === 9,
  "the back button returns to the 9-widget overview"
);

document.querySelector('#mount-workspace [data-stage="development"]').click();
await sleep(20);
const developmentLive = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
const developmentStubs = [...document.querySelectorAll("#mount-workspace .workspace-function-stub")];
assert(
  developmentLive.length === 2 && developmentLive[0].textContent.includes("Editor") && developmentLive[1].textContent.includes("CLI"),
  `Development's Editor and CLI are both real, live functions now (found ${developmentLive.map((el) => el.textContent).join(" | ")})`
);
assert(
  developmentStubs.map((el) => el.querySelector(".workspace-function-label").textContent).join(",") === "Repository",
  `Development shows only Repository as an honestly-labeled stub now (found ${developmentStubs.map((el) => el.textContent).join(" | ")})`
);
assert(
  [...document.querySelectorAll("#mount-workspace .workspace-function-label")].every((el) => el.textContent !== "Git"),
  "Git no longer appears anywhere in the Workspace hub - it moved into Development's Repository stub"
);
developmentLive[0].click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/editor"]').classList.contains("active"), "tapping a live function navigates to the real tab it points at");
assert(document.getElementById("mount-editor").classList.contains("active"), "the Editor tab is now the active page");

// 1c. Design doc generator proof - the one stage with real inline
// functionality (not a link elsewhere, not a stub). No real Anthropic
// call happens here either: past the no-key check, a temporary fake key
// plus a mocked globalThis.fetch (not a real network call) exercises the
// REAL generate/render/create-file flow against a canned Anthropic-
// shaped response - real app logic, no real network, no cost.
document.querySelector('.nav-btn[data-route="/workspace"]').click();
// Workspace kept its own internal drill-down state from section 1b
// (still showing Development's detail view, same "sub-view state
// persists across tab switches" behavior agentic-memory-demo's
// dashboard.ts already established) - its own back button, not the
// bottom nav, returns to the 8-widget overview.
document.querySelector("#workspace-back-btn").click();
await sleep(20);
document.querySelector('#mount-workspace [data-stage="design"]').click();
await sleep(20);
assert(document.querySelector("#design-description") === null, "Design opens its own Architecture/Wireframes list first, not straight into the generator");
const designFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  designFunctions.map((el) => el.querySelector(".workspace-function-label").textContent).join(",") === "Architecture,Wireframes",
  `Architecture and Wireframes are both real, clickable entries (found ${designFunctions.map((el) => el.textContent).join(" | ")})`
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "neither is a stub - both are enabled by the one real capability, not replaced or left fake");

designFunctions[0].click(); // Architecture
await sleep(20);
assert(document.querySelector("#design-description") !== null, "tapping Architecture opens the real generator");

document.querySelector("#design-description").value = "the auth flow for this app";
document.querySelector("#design-generate-btn").click();
await sleep(20);
assert(document.querySelector("#design-status").textContent.includes("Add an Anthropic API key"), "Generate with no key shows the same actionable error as every other AI action");
assert(document.getElementById("design-result").hidden, "no result panel is shown when generation never ran");

window.localStorage.setItem("justjs:ai-editor:api-key", "sk-ant-test-fake-key-not-real");
const originalFetch = globalThis.fetch;
const fakeDesignDoc =
  "# Auth Flow\n\nDescribes the login sequence.\n\n```mermaid\nsequenceDiagram\n  User->>App: submit credentials\n```\n";
globalThis.fetch = async () =>
  new window.Response(JSON.stringify({ content: [{ type: "text", text: fakeDesignDoc }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

document.querySelector("#design-generate-btn").click();
await sleep(50);
assert(!document.getElementById("design-result").hidden, "a successful generate shows the result panel");
assert(document.querySelector("#design-source").value === fakeDesignDoc, "the raw Markdown+Mermaid source is shown in Edit mode by default");
assert(document.querySelector("#design-mode-edit-btn").classList.contains("active"), "Edit is the default view mode after generating");

document.querySelector("#design-mode-preview-btn").click();
assert(document.querySelector("#design-mode-preview-btn").classList.contains("active"), "Preview becomes the active mode immediately, before rendering finishes");
const finishedRendering = await waitUntil(() => !document.querySelector("#design-preview").innerHTML.includes("Rendering…"));
assert(finishedRendering, "the real dynamic import(\"mermaid\") plus attempted render (falling back in this environment) completes within a reasonable time, not hung");
const previewHtml = document.querySelector("#design-preview").innerHTML;
assert(previewHtml.includes("<h1>Auth Flow</h1>"), "the Markdown heading renders as real HTML, not raw escaped text");
assert(
  previewHtml.includes("mermaid-fallback") && previewHtml.includes("couldn"),
  "happy-dom genuinely cannot render Mermaid (getBBox() unsupported) - the real fallback path renders here, not a mocked success, with an honest note rather than a silent blank space"
);
assert(previewHtml.includes("sequenceDiagram"), "the raw mermaid source is still visible inside the fallback, not discarded");

document.querySelector("#design-mode-edit-btn").click();
await sleep(20);
assert(document.querySelector("#design-mode-edit-btn").classList.contains("active"), "toggling back to Edit works");

// "← Design" backs out one level to the Architecture/Wireframes list,
// not all the way to the Workspace overview - and Wireframes opens the
// SAME generator (same in-progress doc still there), proving both
// entries are genuinely backed by the one capability, not two separate
// half-built ones.
document.querySelector("#workspace-back-btn").click();
await sleep(20);
assert(document.querySelector("#design-description") === null, "the generator's own back button returns to Design's function list, not the Workspace overview");
const designFunctionsAgain = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(designFunctionsAgain.length === 2, "Architecture and Wireframes are both still there after backing out");
designFunctionsAgain[1].click(); // Wireframes
await sleep(20);
assert(document.querySelector("#design-source").value.includes("Auth Flow"), "Wireframes opens the same generator with the same in-progress doc, not a separate/reset one");

document.querySelector("#design-file-path").value = "src/main.js";
document.querySelector("#design-create-btn").click();
await sleep(20);
assert(document.querySelector("#design-create-error").textContent.includes("already exists"), "Create file reuses the real pathExists() collision check, same as Scaffold's");

document.querySelector("#design-file-path").value = "design.md";
document.querySelector("#design-create-btn").click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/editor"]').classList.contains("active"), "a successful Create file navigates to the Editor tab");
assert(document.querySelector("#editor-textarea").value.includes("Auth Flow"), "the created file's real generated content is now open in the editor");
assert(treeRow("design.md") !== null, "the new design.md file appears in the real file tree, not a dead end");

// 1d. Presentation slide-deck generator proof - a single real function
// (not two entries sharing one generator like Design), opened directly
// from Presentation's own function list, rendering one slide at a time
// rather than one continuous scroll. Continues reusing the mocked
// globalThis.fetch/fake key from section 1c above (restored/cleared once
// at the very end of both sections together, below).
document.querySelector('.nav-btn[data-route="/workspace"]').click();
// Workspace kept its own internal drill-down state from section 1c
// (still mid-generator, showing Wireframes) - two levels back: generator
// -> Design's Architecture/Wireframes list -> the Workspace overview.
document.querySelector("#workspace-back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);
document.querySelector('#mount-workspace [data-stage="presentation"]').click();
await sleep(20);
const presentationFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  presentationFunctions.length === 1 && presentationFunctions[0].textContent.includes("Slides"),
  `Presentation shows exactly one real function, Slides (found ${presentationFunctions.map((el) => el.textContent).join(" | ")})`
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "Slides is real, not a stub");

presentationFunctions[0].click();
await sleep(20);
assert(document.querySelector("#slides-description") !== null, "tapping Slides opens the real generator directly - no intermediate list, unlike Design's two-entry shape");

window.localStorage.removeItem("justjs:ai-editor:api-key");
document.querySelector("#slides-description").value = "pitch this app to a new team";
document.querySelector("#slides-generate-btn").click();
await sleep(20);
assert(document.querySelector("#slides-status").textContent.includes("Add an Anthropic API key"), "Generate with no key shows the same actionable error as every other AI action");
assert(document.getElementById("slides-result").hidden, "no result panel is shown when generation never ran");

window.localStorage.setItem("justjs:ai-editor:api-key", "sk-ant-test-fake-key-not-real");
// Three slides, two different mermaid diagram types, deliberately:
// sequenceDiagram genuinely throws in happy-dom (getBBox() unsupported)
// and hits the catch block directly; flowchart previously resolved
// WITHOUT throwing but also without a well-formed <svg> root - a gap
// isWellFormedSvg() (core/markdown.ts) now closes by validating the
// resolved value and throwing itself when it's malformed, routing into
// the exact same fallback. Slide 3 proves that fix specifically, not
// just the already-proven sequenceDiagram path slide 2 covers.
const fakeSlidesDoc =
  "# Welcome\n\n- point one\n- point two\n\n---\n\n# Architecture\n\n```mermaid\nsequenceDiagram\n  A->>B: ping\n```\n\n---\n\n# Flowchart\n\n```mermaid\nflowchart TD\n  A --> B\n```\n";
globalThis.fetch = async () =>
  new window.Response(JSON.stringify({ content: [{ type: "text", text: fakeSlidesDoc }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

document.querySelector("#slides-generate-btn").click();
await sleep(50);
assert(!document.getElementById("slides-result").hidden, "a successful generate shows the result panel");
assert(document.querySelector("#slides-source").value === fakeSlidesDoc, "the raw Markdown deck source is shown in Edit mode by default");
assert(document.querySelector("#slides-mode-edit-btn").classList.contains("active"), "Edit is the default view mode after generating");
assert(document.getElementById("slides-preview-wrap").hidden, "the preview/nav area is hidden while in Edit mode");

document.querySelector("#slides-mode-preview-btn").click();
assert(document.querySelector("#slides-mode-preview-btn").classList.contains("active"), "Preview becomes the active mode immediately, before rendering finishes");
const finishedRenderingSlide1 = await waitUntil(() => !document.querySelector("#slides-preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide1, "the real per-slide render completes within a reasonable time for slide 1 (no mermaid fence on this one)");
const slide1Html = document.querySelector("#slides-preview").innerHTML;
assert(slide1Html.includes("<h1>Welcome</h1>"), "slide 1's own heading renders as real HTML");
assert(!slide1Html.includes("Architecture"), "slide 2's content is NOT shown while on slide 1 - real slide-by-slide splitting, not one continuous scroll");
assert(document.querySelector("#slides-indicator").textContent === "Slide 1 of 3", "the nav indicator reflects the real slide count and position");
assert(document.querySelector("#slides-prev-btn").disabled, "Prev is disabled on the first slide");
assert(!document.querySelector("#slides-next-btn").disabled, "Next is enabled - there are more slides");

document.querySelector("#slides-next-btn").click();
const finishedRenderingSlide2 = await waitUntil(() => !document.querySelector("#slides-preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide2, "the real dynamic import(\"mermaid\") plus attempted render (falling back in this environment) completes within a reasonable time on slide 2, not hung");
const slide2Html = document.querySelector("#slides-preview").innerHTML;
assert(slide2Html.includes("<h1>Architecture</h1>"), "slide 2's own heading renders now that Next was tapped");
assert(
  slide2Html.includes("mermaid-fallback") && slide2Html.includes("couldn"),
  "happy-dom genuinely cannot render a sequenceDiagram here either (getBBox() unsupported, throws directly) - the real per-slide fallback path renders, same reasoning as Design's"
);
assert(document.querySelector("#slides-indicator").textContent === "Slide 2 of 3", "the indicator advances with Next");
assert(!document.querySelector("#slides-prev-btn").disabled, "Prev is enabled once past the first slide");
assert(!document.querySelector("#slides-next-btn").disabled, "Next is still enabled - there's a third slide");

document.querySelector("#slides-next-btn").click();
const finishedRenderingSlide3 = await waitUntil(() => !document.querySelector("#slides-preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide3, "the real attempted render for slide 3's flowchart completes within a reasonable time, not hung");
const slide3Html = document.querySelector("#slides-preview").innerHTML;
assert(slide3Html.includes("<h1>Flowchart</h1>"), "slide 3's own heading renders now that Next was tapped again");
assert(
  slide3Html.includes("mermaid-fallback") && slide3Html.includes("couldn"),
  "the flowchart case is now caught too - mermaid.render() resolves here instead of throwing, but isWellFormedSvg() (core/markdown.ts) rejects the malformed result and routes into the same real fallback, not broken/partial markup"
);
assert(document.querySelector("#slides-indicator").textContent === "Slide 3 of 3", "the indicator advances again");
assert(!document.querySelector("#slides-prev-btn").disabled, "Prev is enabled on the last slide");
assert(document.querySelector("#slides-next-btn").disabled, "Next is disabled on the true last slide");

document.querySelector("#slides-file-path").value = "src/main.js";
document.querySelector("#slides-create-btn").click();
await sleep(20);
assert(document.querySelector("#slides-create-error").textContent.includes("already exists"), "Create file reuses the real pathExists() collision check, same as Design's");

document.querySelector("#slides-file-path").value = "slides.md";
document.querySelector("#slides-create-btn").click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/editor"]').classList.contains("active"), "a successful Create file navigates to the Editor tab");
assert(document.querySelector("#editor-textarea").value.includes("Welcome"), "the created file's real generated content is now open in the editor");
assert(treeRow("slides.md") !== null, "the new slides.md file appears in the real file tree, not a dead end");

globalThis.fetch = originalFetch;
window.localStorage.removeItem("justjs:ai-editor:api-key");

// Restores the state every later section assumes (src/main.js active) -
// creating design.md made it the active file instead.
treeRow("src/main.js").querySelector('[data-action="open"]').click();
await sleep(20);

// 1e. CLI proof - a real terminal against this app's own virtual
// filesystem, not an AI-backed interpreter and not a real OS shell.
// Entirely synchronous - no mocked fetch/API key needed at all, unlike
// every AI-backed section above.
document.querySelector('.nav-btn[data-route="/workspace"]').click();
// Workspace kept its own internal drill-down state from section 1d
// (still showing the Slides generator) - two levels back: generator ->
// Presentation's function list -> the Workspace overview.
document.querySelector("#workspace-back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);
document.querySelector('#mount-workspace [data-stage="development"]').click();
await sleep(20);
const developmentLiveForCli = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(developmentLiveForCli[1].textContent.includes("CLI"), "CLI is the second real, live function under Development");
developmentLiveForCli[1].click();
await sleep(20);
assert(document.querySelector("#cli-input") !== null, "tapping CLI opens the real terminal directly - no intermediate list");

function runCliLine(line) {
  const input = document.querySelector("#cli-input");
  input.value = line;
  document.querySelector("#cli-run-btn").click();
}
function lastCliEntry() {
  const entries = [...document.querySelectorAll("#cli-transcript .cli-entry")];
  return entries[entries.length - 1] ?? null;
}
function lastCliOutput() {
  return lastCliEntry()?.querySelector(".cli-entry-output")?.textContent ?? "";
}
function lastCliIsError() {
  return lastCliEntry()?.querySelector(".cli-entry-output")?.classList.contains("cli-entry-error") ?? false;
}

runCliLine("pwd");
assert(lastCliOutput() === "/", "pwd starts at the real root");

runCliLine("ls");
assert(lastCliOutput().includes("src/") && lastCliOutput().includes("README.md"), `ls at root shows the real starter tree (found "${lastCliOutput()}")`);

runCliLine("cd src");
runCliLine("pwd");
assert(lastCliOutput() === "/src", "cd changes the real cwd, reflected in pwd");

runCliLine("ls");
assert(lastCliOutput().includes("main.js") && lastCliOutput().includes("utils/"), `ls inside src shows its real children (found "${lastCliOutput()}")`);

runCliLine("cat main.js");
assert(lastCliOutput().includes("import { greet }"), "cat prints the real file content, resolved relative to cwd");

runCliLine("cd ..");
runCliLine("pwd");
assert(lastCliOutput() === "/", "cd .. returns to the real parent");

runCliLine("mkdir cli-test");
runCliLine("ls");
assert(lastCliOutput().includes("cli-test/"), "mkdir creates a real folder, visible via ls");
assert(treeRow("cli-test") !== null, "mkdir's effect is real - the same folder appears in the real file tree, not just the terminal");

runCliLine("touch cli-test/note.txt");
runCliLine("cat cli-test/note.txt");
assert(lastCliOutput() === "", "touch creates a real, empty file");
assert(treeRow("cli-test/note.txt") !== null, "touch's effect is real - the file appears in the real file tree");

runCliLine("touch README.md");
runCliLine("cat README.md");
assert(lastCliOutput().includes("Starter project"), "touch on an already-existing file is a silent no-op - it does NOT clobber real content with an empty string");

runCliLine("mv cli-test/note.txt cli-test/renamed.txt");
runCliLine("cat cli-test/renamed.txt");
assert(lastCliOutput() === "", "mv renames a real file - the moved file's (empty) content is intact at the new path");
assert(treeRow("cli-test/note.txt") === null, "the old path is really gone from the file tree after mv");

runCliLine("mkdir cli-test/sub");
runCliLine("mv cli-test/renamed.txt cli-test/sub");
runCliLine("ls cli-test/sub");
assert(lastCliOutput().includes("renamed.txt"), "mv into an existing directory moves the file there under its own basename");

runCliLine("mv cli-test cli-test/sub");
assert(lastCliIsError() && lastCliOutput().includes("into itself"), "mv refuses to move a folder into its own descendant");

runCliLine("cp cli-test/sub/renamed.txt cli-test/copy.txt");
runCliLine("cat cli-test/copy.txt");
assert(lastCliOutput() === "", "cp creates a real copy of the file");
assert(treeRow("cli-test/sub/renamed.txt") !== null, "cp leaves the original file in place, unlike mv");
assert(treeRow("cli-test/copy.txt") !== null, "cp's effect is real - the copy appears in the real file tree");

runCliLine("cp cli-test/sub cli-test/sub");
assert(lastCliIsError() && lastCliOutput().includes("into itself"), "cp refuses to copy a folder into itself, the same guard mv has");

runCliLine("mkdir cli-test/sub2");
runCliLine("cp cli-test/sub cli-test/sub2");
runCliLine("ls cli-test/sub2/sub");
assert(lastCliOutput().includes("renamed.txt"), "cp can copy a whole real folder recursively, not just single files");

runCliLine("grep greet src/utils/greet.js");
assert(
  lastCliOutput().includes("/src/utils/greet.js:1:") && lastCliOutput().includes("greet"),
  `grep finds a real match with real file:line:content formatting (found "${lastCliOutput()}")`
);

runCliLine("grep nonexistent-pattern-xyz src");
assert(lastCliOutput() === "", "grep with no matches is a real, honest empty result, not an error - matches real grep's own convention");

runCliLine("grep greet src");
assert(lastCliOutput().includes("greet.js"), "grep searches recursively through a real directory, not just one file");

runCliLine("find src -name greet.js");
assert(lastCliOutput() === "/src/utils/greet.js", `find -name locates a real file by basename anywhere under the real tree (found "${lastCliOutput()}")`);

runCliLine("find src");
assert(
  lastCliOutput().includes("/src/main.js") && lastCliOutput().includes("/src/utils") && lastCliOutput().includes("/src/utils/greet.js"),
  "find with no filter lists every real path recursively, files and folders alike"
);

runCliLine("ssh example.com");
assert(
  !lastCliIsError() && lastCliOutput() === "ssh streaming coming soon",
  `ssh shows an honest "coming soon" roadmap message, not a fake connection and not an error (found "${lastCliOutput()}")`
);

runCliLine("rm cli-test");
assert(lastCliIsError() && lastCliOutput().toLowerCase().includes("directory"), "rm without -r refuses to delete a real, non-empty directory");

runCliLine("rm -r cli-test");
runCliLine("ls");
assert(!lastCliOutput().includes("cli-test"), "rm -r really removes the folder and everything inside it");
assert(treeRow("cli-test") === null, "the real file tree no longer shows cli-test either");

runCliLine("nonsense-command");
assert(lastCliIsError() && lastCliOutput().includes("command not found"), "an unknown command shows a real, honest error, not silent failure");

const cliEntryCountBeforeClear = document.querySelectorAll("#cli-transcript .cli-entry").length;
assert(cliEntryCountBeforeClear > 0, "the transcript has real history before clearing");
runCliLine("clear");
assert(document.querySelectorAll("#cli-transcript .cli-entry").length === 0, "clear wipes the real transcript - a client-side built-in, not routed through core/cli.ts");

document.querySelector("#cli-back-btn").click();
await sleep(20);
const developmentLiveAfterCli = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  developmentLiveAfterCli.length === 2 && developmentLiveAfterCli[1].textContent.includes("CLI"),
  "CLI's own back button returns to Development's function list, not the Workspace overview"
);

document.querySelector("#workspace-back-btn").click();
await sleep(20);

// Restores the state every later section assumes (src/main.js active) -
// touch README.md above didn't change it, but touch cli-test/note.txt
// earlier in this section did.
treeRow("src/main.js").querySelector('[data-action="open"]').click();
await sleep(20);

// 2. Starter tree proof - real nested folders, not a flat list, and the
// active file's ancestor chain is auto-expanded so it's visible without
// the user having to click into a collapsed folder first.
assert(treeRow("src") !== null, "starter tree shows the src folder");
assert(treeRow("src").querySelector('[data-action="toggle"]').textContent.includes("▾"), "src is auto-expanded (contains the active file)");
assert(treeRow("src/utils") !== null, "src's children are visible now that src is expanded");
assert(treeRow("src/utils").querySelector('[data-action="toggle"]').textContent.includes("▸"), "src/utils is collapsed by default (not an ancestor of the active file)");
assert(document.querySelector('.tree-row[data-path="src/utils/greet.js"]') === null, "src/utils's children stay hidden while it's collapsed");
assert(treeRow("src/main.js").classList.contains("tree-file") && treeRow("src/main.js").classList.contains("active"), "src/main.js is the active starter file");
assert(treeRow("README.md") !== null, "root-level README.md is also shown");
const rootFolderIndex = [...document.querySelectorAll("#sidebar-tree .tree-row")].findIndex((r) => r.dataset.path === "src");
const rootFileIndex = [...document.querySelectorAll("#sidebar-tree .tree-row")].findIndex((r) => r.dataset.path === "README.md");
assert(rootFolderIndex < rootFileIndex, "folders render before files at the same level");

// 3. Editor content proof - the active file's real content is loaded and
// actually syntax-highlighted (not just present as plain text).
const textarea = document.querySelector("#editor-textarea");
assert(textarea.value.includes('import { greet }'), "editor shows src/main.js's real starter content");
let highlightHtml = document.querySelector("#editor-highlight code").innerHTML;
assert(highlightHtml.includes('class="tok-keyword"') && highlightHtml.includes(">import<"), "the 'import' keyword is syntax-highlighted");
assert(document.querySelectorAll("#editor-gutter .editor-gutter-line").length === textarea.value.split("\n").length, "gutter line count matches the buffer's real line count");

// 4. File switching proof
treeRow("README.md").querySelector('[data-action="open"]').click();
await sleep(20);
assert(document.querySelector("#editor-textarea").value.includes("Starter project"), "clicking README.md switches the editor to its content");
assert(treeRow("README.md").classList.contains("active"), "README.md is now marked active in the tree");
assert(!treeRow("src/main.js").classList.contains("active"), "src/main.js is no longer marked active");

// 5. Expand/collapse proof
treeRow("src/utils").querySelector('[data-action="toggle"]').click();
await sleep(20);
assert(document.querySelector('.tree-row[data-path="src/utils/greet.js"]') !== null, "expanding src/utils reveals greet.js");
document.querySelector('.tree-row[data-path="src/utils/greet.js"]').querySelector('[data-action="open"]').click();
await sleep(20);
assert(document.querySelector("#editor-textarea").value.includes("export function greet"), "opening greet.js loads its real content");

// 6. Create file proof (root level)
document.querySelector("#sidebar-new-file-btn").click();
await sleep(20);
let createInput = document.querySelector("#tree-create-input");
assert(createInput !== null, "the +File button opens an inline create row, not a native prompt()");
createInput.value = "notes.txt";
createInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
assert(treeRow("notes.txt") !== null, "Enter commits the new file into the tree");
assert(document.querySelector("#editor-textarea").value === "", "the newly created file opens with empty content");

// 6b. Create-file collision proof
document.querySelector("#sidebar-new-file-btn").click();
await sleep(20);
createInput = document.querySelector("#tree-create-input");
createInput.value = "notes.txt";
createInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
assert(!document.getElementById("sidebar-error").hidden, "creating a file at an already-occupied path shows an inline error, not a silent overwrite");
assert(document.getElementById("sidebar-error").textContent.includes("already exists"), "the collision error names the reason");

// 7. Create folder proof
document.querySelector("#sidebar-new-folder-btn").click();
await sleep(20);
document.querySelector("#tree-create-input").value = "docs";
document.querySelector("#tree-create-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
assert(treeRow("docs") !== null && treeRow("docs").classList.contains("tree-folder"), "an explicitly-created empty folder shows up in the tree with nothing in it yet");

// 8. Rename proof
treeRow("notes.txt").querySelector('[data-action="rename"]').click();
await sleep(20);
const renameInput = document.querySelector("#tree-rename-input");
assert(renameInput.value === "notes.txt", "the rename input starts pre-filled with the current name");
renameInput.value = "todo.txt";
renameInput.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
assert(treeRow("todo.txt") !== null, "rename commits the new name");
assert(treeRow("notes.txt") === null, "the old path no longer exists after rename");

// 9. Delete (single file) proof
treeRow("todo.txt").querySelector('[data-action="delete"]').click();
await sleep(20);
assert(document.querySelector(".tree-delete-row") !== null, "delete shows an inline confirm row, not a native confirm()");
assert(document.querySelector(".tree-delete-message").textContent === "Delete 'todo.txt'?", "a single file's confirm message doesn't mention descendants");
document.querySelector('[data-action="confirm-delete"]').click();
await sleep(20);
assert(treeRow("todo.txt") === null, "confirming delete removes the file from the tree");

// 10. Delete (non-empty folder) proof - rm -rf semantics: deleting a
// folder always deletes everything inside it, and the confirm copy says
// so when the folder actually has descendant files.
document.querySelector("#sidebar-new-folder-btn").click();
await sleep(20);
document.querySelector("#tree-create-input").value = "temp";
document.querySelector("#tree-create-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
treeRow("temp").querySelector('[data-action="new-file"]').click();
await sleep(20);
document.querySelector("#tree-create-input").value = "x.js";
document.querySelector("#tree-create-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter" }));
await sleep(20);
assert(treeRow("temp/x.js") !== null, "a file created inside a folder nests under it in the tree");

treeRow("temp").querySelector('[data-action="delete"]').click();
await sleep(20);
assert(
  document.querySelector(".tree-delete-message").textContent === "Delete 'temp' and everything inside it?",
  "deleting a folder with real files inside warns about the cascade, not just the folder name"
);
document.querySelector('[data-action="confirm-delete"]').click();
await sleep(20);
assert(treeRow("temp") === null && treeRow("temp/x.js") === null, "confirming deletes both the folder and everything under it");

// 11. Cross-file jump-to-line proof - directly exercises the real
// x-jump-line event bus and EditorElement's real onJumpToLine handler
// (the actual mechanism a Review finding click uses) without a real
// review() call, since no API key is configured in this fast path.
// Explicitly re-opens README.md first (steps 6-10's create/rename/
// delete actions each change activeFilePath) so the jump's "switch files
// first" behavior has something real to prove against.
treeRow("README.md").querySelector('[data-action="open"]').click();
await sleep(20);
assert(document.querySelector("#editor-textarea").value.includes("Starter project"), "README.md is the active file before the jump");
document.dispatchEvent(new window.CustomEvent("x-jump-line", { detail: { line: 3, filePath: "src/main.js" } }));
await sleep(20);
const jumpedTextarea = document.querySelector("#editor-textarea");
assert(jumpedTextarea.value.includes('import { greet }'), "jumping to a line in src/main.js switches the editor to that file first");
assert(treeRow("src/main.js").classList.contains("active"), "the tree's active-file highlight follows the jump, not just the textarea content");
const jumpedLine = jumpedTextarea.value.slice(jumpedTextarea.selectionStart, jumpedTextarea.selectionEnd);
assert(jumpedLine === 'console.log(greet("world"));', `the correct line (3) is selected after the cross-file jump (selected: "${jumpedLine}")`);

// 12. Settings / API key proof (unchanged behavior from the single-file
// version of this app)
document.querySelector("#settings-btn").click();
assert(!document.getElementById("settings-panel").hidden, "one tap on the gear opens the settings sheet");
assert(document.querySelector("#settings-api-key-status").textContent.includes("No API key set"), "with nothing saved yet, the status line says so explicitly");

document.querySelector("#settings-api-key").value = "sk-ant-test-fake-key-not-real";
document.querySelector("#settings-api-key-save").click();
assert(window.localStorage.getItem("justjs:ai-editor:api-key") === "sk-ant-test-fake-key-not-real", "Save persists the key to localStorage under the documented key");
assert(document.querySelector("#settings-api-key-status").textContent.includes("✓ API key saved"), "the status line reflects a saved key immediately");

document.querySelector("#settings-api-key-clear").click();
assert(window.localStorage.getItem("justjs:ai-editor:api-key") === null, "Clear removes the persisted key from localStorage");
document.querySelector("#settings-close-btn").click();
assert(document.getElementById("settings-panel").hidden, "close button hides the settings sheet");

// 13. No-API-key error states - every AI action must fail loudly and
// specifically (pointing at Settings), never silently no-op. No real
// network call happens anywhere in this section.
document.querySelector('.nav-btn[data-route="/editor"]').click();
document.querySelector("#editor-suggest-btn").click();
await sleep(20);
assert(document.querySelector("#editor-status").textContent.includes("Add an Anthropic API key"), "Suggest with no key shows a real, actionable error");

document.querySelector("#editor-review-btn").click();
await sleep(20);
assert(document.querySelector("#editor-status").textContent.includes("Add an Anthropic API key"), "Review with no key shows the same actionable error");

document.querySelector('.nav-btn[data-route="/chat"]').click();
assert(document.querySelector("#chat-context-label").textContent.startsWith("Context: "), "the chat tab labels which file is being sent as context");
document.querySelector("#chat-input").value = "what does this code do?";
document.querySelector("#chat-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await sleep(30);
const chatMessages = [...document.querySelectorAll(".chat-message")];
assert(chatMessages.some((m) => m.classList.contains("user")), "the user's chat message still renders even though the assistant call will fail");
assert(
  chatMessages.some((m) => m.classList.contains("assistant") && m.textContent.includes("Add an Anthropic API key")),
  "Chat with no key replies with the same actionable error as an assistant message, not a thrown exception"
);

document.querySelector('.nav-btn[data-route="/scaffold"]').click();
document.querySelector("#scaffold-description").value = "a debounce function";
document.querySelector("#scaffold-file-path").value = "src/debounce.js";
document.querySelector("#scaffold-generate-btn").click();
await sleep(20);
assert(document.querySelector("#scaffold-status").textContent.includes("Add an Anthropic API key"), "Scaffold New File with no key shows the same actionable error");
assert(document.querySelector("#scaffold-result").hidden, "no result panel is shown when generation never ran");

document.querySelector("#scaffold-mode-project-btn").click();
assert(document.getElementById("scaffold-project-mode").hidden === false, "switching to New Project mode shows the project form");
assert(document.getElementById("scaffold-file-mode").hidden === true, "and hides the New File form");
document.querySelector("#scaffold-project-description").value = "a tiny CLI";
document.querySelector("#scaffold-generate-project-btn").click();
await sleep(20);
assert(document.querySelector("#scaffold-status").textContent.includes("Add an Anthropic API key"), "Scaffold New Project with no key shows the same actionable error");
assert(document.querySelector("#scaffold-project-result").hidden, "no project preview is shown when generation never ran");

// 14. Voice input proof - happy-dom genuinely has no SpeechRecognition/
// webkitSpeechRecognition (confirmed directly, not assumed: `typeof new
// Window().SpeechRecognition === "undefined"`), so isVoicePromptSupported()
// correctly returns false in this environment and every mic button this
// app would otherwise render stays absent - the same feature-detection
// gate this app's design relies on for real browsers that also lack it.
assert(document.querySelector("#chat-mic-btn") === null, "no SpeechRecognition in this test env - the chat mic button correctly doesn't render");
document.querySelector('.nav-btn[data-route="/scaffold"]').click();
document.querySelector("#scaffold-mode-file-btn").click();
assert(document.querySelector("#scaffold-description-mic-btn") === null, "Scaffold New File's mic button correctly doesn't render either");
document.querySelector("#scaffold-mode-project-btn").click();
assert(document.querySelector("#scaffold-project-description-mic-btn") === null, "Scaffold New Project's mic button correctly doesn't render either");
assert(
  document.querySelector('#scaffold-file-mode input[type="file"]') === null,
  "Scaffold New File has no screenshot-attach control at all - vision is New-Project-only, per the locked scope"
);

// 15. Screenshot attachment proof - a real File attached via input.files
// (using a real DataTransfer, not a direct property hack) and dispatched
// as a genuine 'change' event, exercising the real
// FileReader.readAsDataURL() pipeline happy-dom actually implements -
// same technique agentic-memory-demo/verify_web.mjs already uses for its
// own (local-only) image test. Here the attachment is real vision input
// - Chat/Review/Scaffold-New-Project all send it to Anthropic when a key
// is configured; this fast path proves the attach/preview/reject/clear
// mechanics without ever making that real call.
function attachFakeImage(inputSelector, bytes, filename, mediaType) {
  const input = document.querySelector(inputSelector);
  const file = new window.File([bytes], filename, { type: mediaType });
  const dataTransfer = new window.DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  // 50ms, not this file's usual 20-30ms - matches
  // agentic-memory-demo/verify_web.mjs's own image-attach wait exactly,
  // for the same reason: FileReader.readAsDataURL() completion isn't
  // instant, and a shorter margin here was observed to flake on a real
  // run (not hypothetical - reproduced directly), unlike every other
  // synchronous DOM-update wait in this file.
  return sleep(50);
}

document.querySelector('.nav-btn[data-route="/chat"]').click();
await attachFakeImage("#chat-image-input", "fake-png-bytes", "screenshot.png", "image/png");
assert(!document.getElementById("chat-image-preview").hidden, "attaching a valid screenshot shows a live preview");
assert(document.getElementById("chat-image-thumb").src.startsWith("data:image/png"), "the preview thumbnail is a real data URL read from the file, not a placeholder");

document.querySelector("#chat-image-remove").click();
assert(document.getElementById("chat-image-preview").hidden, "Remove clears the preview");

await attachFakeImage("#chat-image-input", "not-really-an-image", "diagram.svg", "image/svg+xml");
assert(!document.getElementById("chat-image-error").hidden, "an unsupported image type is rejected with a real inline error");
assert(document.getElementById("chat-image-preview").hidden, "no preview is shown for a rejected file");

const oversizedBytes = "x".repeat(5 * 1024 * 1024); // 5MB > this app's 4MB cap
await attachFakeImage("#chat-image-input", oversizedBytes, "huge.png", "image/png");
assert(document.getElementById("chat-image-error").textContent.includes("too large"), "an oversized image is rejected before FileReader ever runs, with a specific error");

await attachFakeImage("#chat-image-input", "fake-png-bytes", "screenshot.png", "image/png");
document.querySelector("#chat-input").value = "what's wrong with this?";
document.querySelector("#chat-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await sleep(30);
const chatMessagesWithImage = [...document.querySelectorAll(".chat-message")];
assert(
  chatMessagesWithImage.some((m) => m.classList.contains("user") && m.querySelector(".chat-message-image")),
  "the sent message's bubble shows the attached screenshot's thumbnail for the user's own reference"
);
assert(
  chatMessagesWithImage.some((m) => m.classList.contains("assistant") && m.textContent.includes("Add an Anthropic API key")),
  "sending a message with an attached screenshot still hits the same no-key error path - no real vision call happens in this fast path"
);
assert(document.getElementById("chat-image-preview").hidden, "the attachment clears after send regardless of outcome, same as the text input");

document.querySelector('.nav-btn[data-route="/review"]').click();
await attachFakeImage("#review-image-input", "fake-jpeg-bytes", "error.jpg", "image/jpeg");
assert(!document.getElementById("review-image-preview").hidden, "Review's attach-screenshot control shows a live preview too");
document.querySelector("#review-run-btn").click();
await sleep(30);
assert(document.querySelector("#review-status").textContent.includes("Add an Anthropic API key"), "Review with an attached screenshot still hits the no-key error path");
assert(document.getElementById("review-image-preview").hidden, "Review's attachment also clears after running, regardless of outcome");

document.querySelector('.nav-btn[data-route="/scaffold"]').click();
document.querySelector("#scaffold-mode-project-btn").click();
await attachFakeImage("#scaffold-project-image-input", "fake-webp-bytes", "mockup.webp", "image/webp");
assert(!document.getElementById("scaffold-project-image-preview").hidden, "Scaffold New Project's attach-screenshot control shows a live preview too");
document.querySelector("#scaffold-project-description").value = "build this UI";
document.querySelector("#scaffold-generate-project-btn").click();
await sleep(30);
assert(document.querySelector("#scaffold-status").textContent.includes("Add an Anthropic API key"), "Scaffold New Project with an attached screenshot still hits the no-key error path");
assert(document.getElementById("scaffold-project-image-preview").hidden, "Scaffold's attachment also clears after generating, regardless of outcome");

document.querySelector('.nav-btn[data-route="/editor"]').click();

// 16. Persistence proof - the whole project (files/emptyFolders/
// activeFilePath) round-trips through localStorage, debounced so a
// keystroke doesn't synchronously stringify the whole project on every
// input event.
await sleep(500);
const stored = JSON.parse(window.localStorage.getItem("justjs:ai-editor:project"));
assert(stored.files["src/main.js"] !== undefined && stored.files["README.md"] !== undefined, "untouched starter files are present in the persisted project");
assert(
  stored.files["notes.txt"] === undefined && stored.files["todo.txt"] === undefined && stored.files["temp/x.js"] === undefined,
  "the file renamed then deleted during this run, and the folder deleted wholesale, are not resurrected in the persisted snapshot"
);
assert(stored.emptyFolders.includes("docs"), "an explicitly-created empty folder is persisted even with nothing inside it");
assert(stored.activeFilePath === "src/main.js", "the currently active file (set by the cross-file jump) is persisted");

// 17. Live Anthropic call proof - real-time and real-cost (an actual
// billed API call), gated behind an explicit opt-in so the fast path
// above stays the default dev-loop check. Requires both flags: the
// env-var opt-in AND a real key, matching agentic-memory-demo's
// VERIFY_FORGETTING precedent for costly, non-default verification.
if (process.env.AI_CODE_EDITOR_LIVE_TEST === "1" && process.env.ANTHROPIC_API_KEY) {
  console.log("AI_CODE_EDITOR_LIVE_TEST=1 - exercising a real Anthropic API call...");
  window.localStorage.setItem("justjs:ai-editor:api-key", process.env.ANTHROPIC_API_KEY);

  const liveTextarea = document.querySelector("#editor-textarea");
  liveTextarea.value = "function add(a, b) {\n  return a ";
  liveTextarea.dispatchEvent(new window.Event("input", { bubbles: true }));
  liveTextarea.setSelectionRange(liveTextarea.value.length, liveTextarea.value.length);
  document.querySelector("#editor-suggest-btn").click();
  await sleep(15_000);
  assert(
    liveTextarea.value.length > "function add(a, b) {\n  return a ".length,
    `a real Suggest call appended real completion text (buffer: "${liveTextarea.value}")`
  );
  assert(document.querySelector("#editor-status").hidden, "a successful real call clears the status line");
} else {
  console.log(
    "skipping live Anthropic call proof (set AI_CODE_EDITOR_LIVE_TEST=1 and ANTHROPIC_API_KEY to run it - costs a real, billed API call)"
  );
}

console.log("\nALL CHECKS PASSED");
