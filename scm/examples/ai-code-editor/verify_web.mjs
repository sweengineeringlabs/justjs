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
import { readdirSync, readFileSync, existsSync } from "fs";
import { createServer } from "http";
import { extname } from "path";

const nodeFetch = globalThis.fetch;

// app.ts's main() now fetch()es /dom-address-map.json and /routes.gen.json
// at runtime (justjs#95's justweb retrofit - Vite's dev server refuses to
// resolve a JS `import` of anything under public/, so those are fetched,
// not bundled). A relative fetch() needs a real page origin to resolve
// against - a bare happy-dom Window with no server behind it can't do
// that (Node's fetch throws "Failed to parse URL from /..."). Serving
// dist/ over a real local HTTP server, same as a real browser would see
// it, is more faithful to production than working around the fetch -
// and it's what caught the original bug in the first place.
const MIME_TYPES = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".html": "text/html" };
const server = createServer((req, res) => {
  const path = `./dist${req.url.split("?")[0]}`;
  if (!existsSync(path)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME_TYPES[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
const serverOrigin = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});
// One-shot script - never block process exit waiting for this to close.
server.unref();

const window = new Window({ url: `${serverOrigin}/` });
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
// Plain Node fetch (unlike a real browser's) has no notion of a page
// origin, so a relative fetch("/foo") still throws even with a real
// server running - resolve relative input against document.baseURI
// first. An absolute URL (e.g. the live Anthropic API test's real
// request) passes through unchanged, since URL's base is ignored once
// the input already has its own scheme.
globalThis.fetch = (input, init) =>
  nodeFetch(typeof input === "string" ? new URL(input, document.baseURI) : input, init);

document.body.innerHTML = `
  <div id="app">
    <header class="app-header">
      <div class="brand">
        <h1>AI Code Editor</h1>
        <button id="settings-btn" type="button">Settings</button>
        <button id="theme-toggle-btn" type="button">
          <span class="icon-sun" hidden></span>
          <span class="icon-moon"></span>
        </button>
      </div>
    </header>
    <nav class="nav">
      <div class="nav-group" data-group="develop">
        <button class="nav-btn active" data-route="/editor">Editor</button>
        <button class="nav-btn" data-route="/chat">Chat</button>
        <button class="nav-btn" data-route="/review">Review</button>
        <button class="nav-btn" data-route="/scaffold">Scaffold</button>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-group" data-group="workspace">
        <button class="nav-btn" data-route="/workspace">Workspace</button>
      </div>
      <div class="nav-divider"></div>
      <div class="nav-group" data-group="connect">
        <button class="nav-btn" data-route="/communication">Comms</button>
        <button class="nav-btn" data-route="/socials">Socials</button>
        <button class="nav-btn" data-route="/cartoon">Cartoon</button>
      </div>
    </nav>
    <!-- data-ddas-id is stamped at runtime by the real bundle's stampMounts()
         call (src/mounts.gen.ts, justweb.toml's [mounts]), not seeded here -
         matches index.html, see justjs#95. -->
    <div id="mount-editor" class="page active"></div>
    <div id="mount-chat" class="page"></div>
    <div id="mount-review" class="page"></div>
    <div id="mount-scaffold" class="page"></div>
    <div id="mount-workspace" class="page"></div>
    <div id="mount-communication" class="page"></div>
    <div id="mount-socials" class="page"></div>
    <div id="mount-cartoon" class="page"></div>
    <div id="settings-panel" hidden>
      <div id="settings-backdrop"></div>
      <div class="settings-sheet">
        <div class="settings-sheet-header">
          <h2>Settings</h2>
          <button id="settings-close-btn" type="button">close</button>
        </div>
        <select id="settings-theme-select"></select>
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
// Polls for real boot completion instead of a fixed sleep - a flat
// 200ms margin (this app's original value, from before Requirement/
// Planning's real PM connectors added more code to parse/eval) became
// measurably too tight under real system load, confirmed via a minimal
// isolated repro: the identical bundle booted correctly 5/5 times with
// a 500ms margin but flaked with 200ms. Polling scales the wait to
// whatever the environment actually needs, fast or slow, rather than
// picking one fixed number that's either wasteful or occasionally too
// tight - same technique this file's own waitUntil() already uses for
// Mermaid rendering below.
for (let attempt = 0; attempt < 100 && document.title !== "ai-code-editor: mounted" && !document.title.startsWith("ai-code-editor: boot failed"); attempt++) {
  await new Promise((r) => setTimeout(r, 50));
}

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
assert(document.getElementById("mount-communication").innerHTML.length > 0, "communication mount has content");
assert(document.getElementById("mount-socials").innerHTML.length > 0, "socials mount has content");
assert(document.getElementById("mount-cartoon").innerHTML.length > 0, "cartoon mount has content");

// 1b. Workspace hub proof - the widget-grid-then-drill-down SDLC hub.
// Functions with a real backing tab (Ideation->Chat, Planning->Scaffold,
// Development->Editor, Testing->Review) are live links; the rest are
// honestly-labeled stubs, not fake-functional buttons.
// WorkspaceElement's SDLC hub overview is migrated onto <view-grid>
// (justjs#108) - the 9 stage tiles now live inside its shadow root as
// data-id-tagged .tile buttons, not light-DOM [data-stage] elements.
// The drilled-in stage view itself (#workspace-view) still gets a
// real light-DOM data-stage attribute (renderStage() - unchanged), so
// that part of app.css's [data-stage="..."] coloring is untouched.
function workspaceOverviewTiles() {
  return [...(document.querySelector("#mount-workspace view-grid")?.shadowRoot?.querySelectorAll(".tile") ?? [])];
}
function clickWorkspaceOverviewTile(stageKey) {
  document.querySelector("#mount-workspace view-grid")?.shadowRoot?.querySelector(`.tile[data-id="${stageKey}"]`)?.click();
}

document.querySelector('.nav-btn[data-route="/workspace"]').click();
const workspaceWidgets = workspaceOverviewTiles();
assert(workspaceWidgets.length === 9, `the workspace overview shows exactly 9 widgets - the 8 SDLC stages plus Presentation (found ${workspaceWidgets.length})`);
assert(
  workspaceWidgets.map((w) => w.dataset.id).join(",") ===
    "ideation,requirement,planning,design,development,testing,deployment,operations,presentation",
  "the 8 SDLC-stage widgets are in order, with Presentation appended after them"
);

// 1b-pm. Requirement/Planning proof - a real project-management
// connector (@justjs/pm-connect) shared across two stages, same
// one-real-capability-many-entries shape Design's Architecture/
// Wireframes already established within a single stage. No credential
// is set anywhere in this run, so this proves each real provider's own
// "nothing entered yet" error path (plus Jira's real navigate-away
// button, spied rather than actually followed), not a live external
// network call.
clickWorkspaceOverviewTile("requirement");
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace__stage-title").textContent.includes("Requirement"),
  "drilling into Requirement shows its own detail view"
);
const requirementLive = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  requirementLive.length === 2 && requirementLive[0].textContent.includes("Specs") && requirementLive[1].textContent.includes("User Stories"),
  `Requirement's Specs and User Stories are both real, live functions now, not stubs (found ${requirementLive.map((el) => el.textContent).join(" | ")})`
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "Requirement has no stubs left");

// PM's connector (justjs#125) owns its own Shadow DOM too, same 3-level
// nesting as SCM's - plus a real Jira OAuth-redirect field (justjs#125's
// own extension: oauthRedirect/oauthBegin), so pmConnectorShadow's
// view-form lookups reuse the exact same pattern as SCM's.
function pmConnectorShadow() {
  return document.querySelector("control-provider-connector")?.shadowRoot ?? null;
}
function pmGridShadow() {
  return pmConnectorShadow()?.querySelector("view-grid")?.shadowRoot ?? null;
}
requirementLive[0].click();
await sleep(20);
assert(document.getElementById("pm-header").title === "Project Management", "Specs opens a real PM connector grid, not a stub");
const pmProviderTiles = [...pmGridShadow().querySelectorAll(".tile")];
const pmProviderNames = pmProviderTiles.map((el) => el.querySelector(".tile-label").textContent);
assert(
  pmProviderNames.includes("Linear") && pmProviderNames.includes("Asana") && pmProviderNames.includes("Trello") && pmProviderNames.includes("Jira"),
  `Requirement's PM connector opens a real catalog of all 4 actual providers (found ${pmProviderNames.join(", ")})`
);
assert(pmProviderTiles.every((el) => !el.classList.contains("selected")), "no PM provider shows as Connected before any credential is ever saved");

pmGridShadow().querySelector('[data-id="linear"]').click();
await sleep(20);
const linearForm = pmConnectorShadow().querySelector("view-form");
assert(linearForm.shadowRoot.querySelector('[data-field-id="token"]') !== null, "Linear shows a single token input, same shape as every other bearer-token provider");
linearForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  pmConnectorShadow().querySelector("view-status-line").text.includes("Paste a token first"),
  "connecting Linear with an empty token shows a real, actionable error, not a silent no-op"
);

pmConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
pmGridShadow().querySelector('[data-id="trello"]').click();
await sleep(20);
const trelloForm = pmConnectorShadow().querySelector("view-form");
assert(
  trelloForm.shadowRoot.querySelector('[data-field-id="apiKey"]') !== null && trelloForm.shadowRoot.querySelector('[data-field-id="token"]') !== null,
  "Trello shows two real fields (API key + token), matching AWS's/Jira's own two-field shape"
);
trelloForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  pmConnectorShadow().querySelector("view-status-line").text.includes("Enter both"),
  "connecting Trello with empty fields shows a real, actionable error naming what's missing"
);

pmConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
pmGridShadow().querySelector('[data-id="jira"]').click();
await sleep(20);
const jiraForm = pmConnectorShadow().querySelector("view-form");
assert(
  jiraForm.shadowRoot.querySelector('[data-field-id="clientId"]') !== null && jiraForm.shadowRoot.querySelector('[data-field-id="clientSecret"]') !== null,
  "Jira shows two real fields (OAuth app Client ID + Secret), not a single token input"
);
assert(
  pmConnectorShadow().querySelector(".settings-disclosure").textContent.includes("developer.atlassian.com") &&
    pmConnectorShadow().querySelector(".settings-disclosure").textContent.includes(window.location.origin),
  "Jira's disclosure explains the real bring-your-own-OAuth-app setup, including the real redirect URI to register"
);
jiraForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  pmConnectorShadow().querySelector("view-status-line").text.includes("Enter both the Client ID and Client Secret"),
  "connecting Jira with empty fields shows a real, actionable error naming what's missing"
);

// The empty-field error above went through #handleOAuthBegin's own
// catch path, which DOES re-render (unlike the success path) to show
// the error - re-query view-form fresh rather than reusing the now-
// stale, detached jiraForm reference from before that re-render.
const jiraFormAfterError = pmConnectorShadow().querySelector("view-form");
jiraFormAfterError.shadowRoot.querySelector('[data-field-id="clientId"]').value = "fake-client-id";
jiraFormAfterError.shadowRoot.querySelector('[data-field-id="clientSecret"]').value = "fake-client-secret";
let assignedUrl = null;
const originalLocationAssign = window.location.assign.bind(window.location);
window.location.assign = (url) => {
  assignedUrl = url;
};
jiraFormAfterError.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  typeof assignedUrl === "string" && assignedUrl.startsWith("https://auth.atlassian.com/authorize?"),
  `Jira's real Connect button navigates the browser to Atlassian's real consent screen rather than resolving in place (found ${assignedUrl})`
);
assert(
  new URL(assignedUrl).searchParams.get("client_id") === "fake-client-id",
  "the real authorization URL carries the client ID the user actually entered"
);
window.location.assign = originalLocationAssign;

// pmScreen (justjs#125) is cached the same way as scmScreen - a real
// keep-alive router tab switch never touches #mount-workspace's
// subtree, so Jira's still-open detail screen (with the client ID the
// user just typed) should survive switching away and back.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  pmConnectorShadow().querySelector("view-form")?.shadowRoot?.querySelector('[data-field-id="clientId"]')?.value === "fake-client-id",
  "switching away from and back to Workspace preserves Jira's still-open detail screen and the client ID typed into it - the cached control-provider-connector instance survives, not recreated"
);

pmConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
document.getElementById("pm-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace-function-live")?.textContent.includes("Specs"),
  "the grid's own back button returns to Requirement's function list, not the Workspace overview"
);

document.querySelector("#workspace-back-btn").click();
await sleep(20);
clickWorkspaceOverviewTile("planning");
await sleep(20);
const planningLive = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  planningLive.length === 2 && planningLive[0].textContent.includes("Scaffold") && planningLive[1].textContent.includes("Project Boards"),
  `Planning keeps its real Scaffold link and gains a real Project Boards entry (found ${planningLive.map((el) => el.textContent).join(" | ")})`
);
planningLive[1].click();
await sleep(20);
assert(
  document.getElementById("pm-header").backLabel === "Planning",
  "Planning's own entry refreshes the shared header's back label, not stuck on Requirement's from before"
);
assert(
  pmConnectorShadow().querySelector("view-nav-header") === null,
  "leaving Requirement via the overview and entering PM from Planning really resets to the provider grid, not Jira's still-open detail screen"
);
const planningPmProviderNames = [...pmGridShadow().querySelectorAll(".tile .tile-label")].map((el) => el.textContent);
assert(
  planningPmProviderNames.includes("Linear") && planningPmProviderNames.includes("Jira"),
  "Planning's Project Boards opens the exact same real PM connector - one real capability shared across two stages, same precedent Design's Architecture/Wireframes already established"
);
document.getElementById("pm-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);

clickWorkspaceOverviewTile("presentation");
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace__stage-title").textContent.includes("Presentation"),
  "Presentation drills into its own detail view like every other widget"
);
assert(
  document.querySelector("#mount-workspace .workspace-function-live .workspace-function-label")?.textContent === "Slides",
  "Presentation shows Slides as a real, live function, not a stub - full generator flow proved in section 1d below"
);
document.querySelector("#workspace-back-btn").click();
await sleep(20);

clickWorkspaceOverviewTile("deployment");
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace__stage-title").textContent.includes("Deployment"),
  "drilling into a widget shows that stage's detail view"
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "Deployment has no stubs left - Git moved to Development's Repository, and Cloud is now real");
const deploymentFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  deploymentFunctions.length === 1 && deploymentFunctions[0].textContent.includes("Cloud"),
  `Deployment shows exactly one real function, Cloud (found ${deploymentFunctions.map((el) => el.textContent).join(" | ")})`
);

// Cloud providers: a real, recognizable catalog (not a free-text "type
// any name" list) - tapping a card opens that provider's own real
// connect screen. Migrated onto <control-cloud-connector> (justjs#126,
// app-local sibling to <control-provider-connector>), so every lookup
// below traverses into its own Shadow DOM (and, for the provider grid,
// the further-nested <view-grid>'s own shadow root, same 3-level
// nesting as SCM/PM). No API key is set anywhere in this run, so every
// provider proves its real "not connected"/"paste a token first" path -
// same fast-path philosophy as the Anthropic key's "no key configured"
// tests above, not a live external network call.
function cloudConnectorShadow() {
  return document.querySelector("control-cloud-connector")?.shadowRoot ?? null;
}
function cloudGridShadow() {
  return cloudConnectorShadow()?.querySelector("view-grid")?.shadowRoot ?? null;
}
deploymentFunctions[0].click();
await sleep(20);
const providerTiles = [...cloudGridShadow().querySelectorAll(".tile")];
const providerNames = providerTiles.map((el) => el.querySelector(".tile-label").textContent);
assert(
  providerNames.includes("AWS") && providerNames.includes("Microsoft Azure") && providerNames.includes("Google Cloud"),
  `Cloud opens a real catalog of actual, recognizable providers (found ${providerNames.join(", ")})`
);
assert(providerTiles.every((el) => !el.classList.contains("selected")), "no provider shows as Connected before any token is ever saved");

cloudGridShadow().querySelector('[data-id="digitalocean"]').click();
await sleep(20);
assert(
  cloudConnectorShadow().querySelector("view-nav-header").textContent.includes("DigitalOcean"),
  "tapping a provider card opens that provider's own connect screen"
);
let cloudForm = cloudConnectorShadow().querySelector("view-form");
assert(cloudForm.shadowRoot.querySelector('[data-field-id="token"]') !== null, "a bearer-token provider shows a single token input");
assert(
  cloudConnectorShadow().querySelector(".settings-disclosure").textContent.includes("Stored only on this device"),
  "the connect screen discloses where the token is stored/sent, same tone as the Anthropic key's settings sheet"
);
cloudForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  cloudConnectorShadow().querySelector("view-status-line").text.includes("Paste a token first"),
  "connecting with an empty token shows a real, actionable error, not a silent no-op"
);
assert(cloudConnectorShadow().querySelector("#main-list") === null, "no resource list renders without a real successful connect");

cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(document.getElementById("cloud-header").title === "Cloud Providers", "a provider's own back button returns to the Cloud Providers grid, not all the way to Deployment");

cloudGridShadow().querySelector('[data-id="aws"]').click();
await sleep(20);
cloudForm = cloudConnectorShadow().querySelector("view-form");
assert(
  cloudForm.shadowRoot.querySelector('[data-field-id="accessKeyId"]') !== null && cloudForm.shadowRoot.querySelector('[data-field-id="secretAccessKey"]') !== null,
  "AWS shows two real fields (access key ID + secret access key), not a single token input"
);
assert(
  cloudConnectorShadow().querySelector(".settings-disclosure").textContent.includes("SigV4") &&
    cloudConnectorShadow().querySelector(".settings-disclosure").textContent.includes("temporary"),
  "AWS's disclosure mentions real SigV4 signing and AWS's own temporary-credentials guidance, not the generic bearer-token copy"
);
cloudForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  cloudConnectorShadow().querySelector("view-status-line").text.includes("Enter both"),
  "connecting AWS with empty fields shows a real, actionable error naming what's missing"
);

// cloudScreen (justjs#126) is cached the same way as scmScreen/
// pmScreen - a real keep-alive router tab switch never touches
// #mount-workspace's subtree, so AWS's still-open detail screen (with
// its error still shown) should survive switching away and back.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  cloudConnectorShadow().querySelector("view-nav-header")?.textContent.includes("AWS"),
  "switching away from and back to Workspace preserves the Cloud provider detail screen - the cached control-cloud-connector instance survives, not recreated"
);

cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
cloudGridShadow().querySelector('[data-id="azure"]').click();
await sleep(20);
assert(
  cloudConnectorShadow().querySelector(".connect-hint").textContent.includes("az account get-access-token"),
  "Azure's connect screen shows the real CLI command to get a token, not a hidden requirement"
);

cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
cloudGridShadow().querySelector('[data-id="cloudflare"]').click();
await sleep(20);
assert(cloudConnectorShadow().querySelector("view-form") === null, "Cloudflare shows no connect form at all - no confirmed CORS access, not a form that would silently fail");
assert(
  cloudConnectorShadow().querySelector(".connect-hint").textContent.includes("did not return CORS headers"),
  "Cloudflare's screen states honestly why it can't connect, not a generic disabled state"
);

cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);

// Real "Deploy this project" proof (Netlify) - a mocked-fetch, real-
// app-logic technique (no real network call), same philosophy Design's/
// Slides' own mocked Anthropic responses use. Confirms: (1) the Deploy
// button is genuinely gated on a real successful connect (absent for
// DigitalOcean above, which never got a successful connect in this
// run), (2) it only shows for the 3 real deploy-capable providers, and
// (3) a full deploy really drives the real create-site/manifest/upload/
// poll sequence end to end, landing on a real clickable result link.
assert(
  cloudConnectorShadow().querySelector("#main-list") === null,
  "sanity check: DigitalOcean above never got a successful connect in this run, so no deploy button could have shown for it either"
);

cloudGridShadow().querySelector('[data-id="netlify"]').click();
await sleep(20);
assert(cloudConnectorShadow().querySelector("#deploy-btn") === null, "no Deploy button before any successful connect - it's gated the same way AWS's List EC2 Instances is");

const netlifyOriginalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const method = init?.method ?? "GET";
  const json = (body, status = 200) => new window.Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url === "https://api.netlify.com/api/v1/sites" && method === "GET") {
    return json([{ id: "site-1", name: "demo", state: "current" }]);
  }
  if (url === "https://api.netlify.com/api/v1/sites" && method === "POST") {
    return json({ id: "new-site-1", url: "http://new-site-1.netlify.app", ssl_url: "https://new-site-1.netlify.app" });
  }
  if (url === "https://api.netlify.com/api/v1/sites/new-site-1/deploys" && method === "POST") {
    const body = JSON.parse(init.body);
    return json({ id: "deploy-1", required: Object.values(body.files) });
  }
  if (url.startsWith("https://api.netlify.com/api/v1/deploys/deploy-1/files/") && method === "PUT") {
    return new window.Response("", { status: 200 });
  }
  if (url === "https://api.netlify.com/api/v1/deploys/deploy-1" && method === "GET") {
    return json({ id: "deploy-1", state: "ready", ssl_url: "https://new-site-1.netlify.app" });
  }
  throw new Error(`verify_web.mjs: unexpected fetch in the Netlify deploy mock: ${method} ${url}`);
};

cloudForm = cloudConnectorShadow().querySelector("view-form");
cloudForm.shadowRoot.querySelector('[data-field-id="token"]').value = "fake-netlify-token";
cloudForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(30);
assert(cloudConnectorShadow().querySelector("#main-list") !== null, "a real successful connect now shows the real site list");
assert(cloudConnectorShadow().querySelector("#deploy-btn") !== null, "Netlify (a real deploy-capable provider) now shows a real 'Deploy this project' button");

cloudConnectorShadow().querySelector("#deploy-btn").click();
await sleep(300);
assert(
  cloudConnectorShadow().querySelector('#deploy-result a[href="https://new-site-1.netlify.app"]') !== null,
  "a real successful deploy renders the real live URL the mocked API returned, as a real clickable link"
);
assert(
  window.localStorage.getItem("justjs:ai-editor:cloud-deploy-target:netlify") === "new-site-1",
  "the real site id returned by the deploy is persisted, so a later deploy redeploys the same site instead of creating a new one"
);

globalThis.fetch = netlifyOriginalFetch;
cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);

cloudGridShadow().querySelector('[data-id="vercel"]').click();
await sleep(20);
cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
cloudGridShadow().querySelector('[data-id="heroku"]').click();
await sleep(20);
cloudConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);

document.getElementById("cloud-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(
  document.querySelector("#mount-workspace .workspace-function-live")?.textContent.includes("Cloud"),
  "the grid's own back button returns to Deployment's function list, not the Workspace overview"
);

document.querySelector("#workspace-back-btn").click();
await sleep(20);
assert(workspaceOverviewTiles().length === 9, "the back button returns to the 9-widget overview");

clickWorkspaceOverviewTile("development");
await sleep(20);
const developmentLive = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
const developmentStubs = [...document.querySelectorAll("#mount-workspace .workspace-function-stub")];
assert(
  developmentLive.length === 3 &&
    developmentLive[0].textContent.includes("Editor") &&
    developmentLive[1].textContent.includes("CLI") &&
    developmentLive[2].textContent.includes("Repository"),
  `Development's Editor, CLI, and Repository are all real, live functions now (found ${developmentLive.map((el) => el.textContent).join(" | ")})`
);
assert(
  developmentStubs.length === 0,
  `Development has no stubs left - Repository is now real too (found ${developmentStubs.map((el) => el.textContent).join(" | ")})`
);
assert(
  [...document.querySelectorAll("#mount-workspace .workspace-function-label")].every((el) => el.textContent !== "Git"),
  "Git no longer appears anywhere in the Workspace hub - it moved into Development's Repository, now a real connect screen"
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
clickWorkspaceOverviewTile("design");
await sleep(20);

// control-design-generator (justjs#123) owns its own Shadow DOM - every
// #design-* lookup below goes through its shadowRoot instead of the
// light DOM the original hand-rolled markup used.
function designShadow() {
  return document.querySelector("control-design-generator")?.shadowRoot ?? null;
}
assert(designShadow() === null, "Design opens its own Architecture/Wireframes list first, not straight into the generator");
const designFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  designFunctions.map((el) => el.querySelector(".workspace-function-label").textContent).join(",") === "Architecture,Wireframes",
  `Architecture and Wireframes are both real, clickable entries (found ${designFunctions.map((el) => el.textContent).join(" | ")})`
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "neither is a stub - both are enabled by the one real capability, not replaced or left fake");

designFunctions[0].click(); // Architecture
await sleep(20);
assert(designShadow() !== null, "tapping Architecture opens the real generator");

designShadow().querySelector("#description").value = "the auth flow for this app";
designShadow().querySelector("#generate-btn").click();
await sleep(20);
assert(designShadow().querySelector("#status").text.includes("Add an Anthropic API key"), "Generate with no key shows the same actionable error as every other AI action");
assert(designShadow().querySelector("#result").hidden, "no result panel is shown when generation never ran");

window.localStorage.setItem("justjs:ai-editor:api-key", "sk-ant-test-fake-key-not-real");
const originalFetch = globalThis.fetch;
const fakeDesignDoc =
  "# Auth Flow\n\nDescribes the login sequence.\n\n```mermaid\nsequenceDiagram\n  User->>App: submit credentials\n```\n";
globalThis.fetch = async () =>
  new window.Response(JSON.stringify({ content: [{ type: "text", text: fakeDesignDoc }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

designShadow().querySelector("#generate-btn").click();
await sleep(50);
assert(!designShadow().querySelector("#result").hidden, "a successful generate shows the result panel");
assert(designShadow().querySelector("#source").value === fakeDesignDoc, "the raw Markdown+Mermaid source is shown in Edit mode by default");
assert(designShadow().querySelector("#mode-edit-btn").classList.contains("active"), "Edit is the default view mode after generating");

designShadow().querySelector("#mode-preview-btn").click();
assert(designShadow().querySelector("#mode-preview-btn").classList.contains("active"), "Preview becomes the active mode immediately, before rendering finishes");
const finishedRendering = await waitUntil(() => !designShadow().querySelector(".preview").innerHTML.includes("Rendering…"));
assert(finishedRendering, "the real dynamic import(\"mermaid\") plus attempted render (falling back in this environment) completes within a reasonable time, not hung");
const previewHtml = designShadow().querySelector(".preview").innerHTML;
assert(previewHtml.includes("<h1>Auth Flow</h1>"), "the Markdown heading renders as real HTML, not raw escaped text");
assert(
  previewHtml.includes("mermaid-fallback") && previewHtml.includes("couldn"),
  "happy-dom genuinely cannot render Mermaid (getBBox() unsupported) - the real fallback path renders here, not a mocked success, with an honest note rather than a silent blank space"
);
assert(previewHtml.includes("sequenceDiagram"), "the raw mermaid source is still visible inside the fallback, not discarded");

designShadow().querySelector("#mode-edit-btn").click();
await sleep(20);
assert(designShadow().querySelector("#mode-edit-btn").classList.contains("active"), "toggling back to Edit works");

// control-design-generator (justjs#123) is cached on WorkspaceElement,
// same reasoning as control-cli-terminal (justjs#122) - a real
// keep-alive router (justjs#94) tab switch never touches that subtree
// at all, so this proves the extraction didn't regress the generator's
// own real, non-store-backed doc state.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  designShadow() !== null && designShadow().querySelector("#source").value === fakeDesignDoc,
  "switching away from and back to Workspace preserves the Design generator's real in-progress doc - the cached control-design-generator instance survives, not recreated"
);

// "← Design" backs out one level to the Architecture/Wireframes list,
// not all the way to the Workspace overview - and Wireframes opens the
// SAME generator (same in-progress doc still there), proving both
// entries are genuinely backed by the one capability, not two separate
// half-built ones. The back button lives inside <view-nav-header>'s own
// nested Shadow DOM (control-design-generator composes it, justjs#123)
// - double shadow traversal to reach the real .back-btn.
designShadow().querySelector("#header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(designShadow() === null, "the generator's own back button returns to Design's function list, not the Workspace overview");
const designFunctionsAgain = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(designFunctionsAgain.length === 2, "Architecture and Wireframes are both still there after backing out");
designFunctionsAgain[1].click(); // Wireframes
await sleep(20);
assert(designShadow().querySelector("#source").value.includes("Auth Flow"), "Wireframes opens the same generator with the same in-progress doc, not a separate/reset one");

designShadow().querySelector("#file-path").value = "src/main.js";
designShadow().querySelector("#create-btn").click();
await sleep(20);
assert(designShadow().querySelector("#create-error").textContent.includes("already exists"), "Create file reuses the real pathExists() collision check, same as Scaffold's");

designShadow().querySelector("#file-path").value = "design.md";
designShadow().querySelector("#create-btn").click();
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
// The first back click hits Design's generator - its own Shadow DOM
// back button (justjs#123), same double-traversal as above.
designShadow().querySelector("#header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);
clickWorkspaceOverviewTile("presentation");
await sleep(20);
const presentationFunctions = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  presentationFunctions.length === 1 && presentationFunctions[0].textContent.includes("Slides"),
  `Presentation shows exactly one real function, Slides (found ${presentationFunctions.map((el) => el.textContent).join(" | ")})`
);
assert(document.querySelector("#mount-workspace .workspace-function-stub") === null, "Slides is real, not a stub");

// control-presentation-generator (justjs#123) owns its own Shadow DOM
// too - same #slides-* -> shadowRoot traversal as Design above.
function presentationShadow() {
  return document.querySelector("control-presentation-generator")?.shadowRoot ?? null;
}
presentationFunctions[0].click();
await sleep(20);
assert(presentationShadow() !== null, "tapping Slides opens the real generator directly - no intermediate list, unlike Design's two-entry shape");

window.localStorage.removeItem("justjs:ai-editor:api-key");
presentationShadow().querySelector("#description").value = "pitch this app to a new team";
presentationShadow().querySelector("#generate-btn").click();
await sleep(20);
assert(presentationShadow().querySelector("#status").text.includes("Add an Anthropic API key"), "Generate with no key shows the same actionable error as every other AI action");
assert(presentationShadow().querySelector("#result").hidden, "no result panel is shown when generation never ran");

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

presentationShadow().querySelector("#generate-btn").click();
await sleep(50);
assert(!presentationShadow().querySelector("#result").hidden, "a successful generate shows the result panel");
assert(presentationShadow().querySelector("#source").value === fakeSlidesDoc, "the raw Markdown deck source is shown in Edit mode by default");
assert(presentationShadow().querySelector("#mode-edit-btn").classList.contains("active"), "Edit is the default view mode after generating");
assert(presentationShadow().querySelector("#preview-area").hidden, "the preview/nav area is hidden while in Edit mode");

presentationShadow().querySelector("#mode-preview-btn").click();
assert(presentationShadow().querySelector("#mode-preview-btn").classList.contains("active"), "Preview becomes the active mode immediately, before rendering finishes");
const finishedRenderingSlide1 = await waitUntil(() => !presentationShadow().querySelector(".preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide1, "the real per-slide render completes within a reasonable time for slide 1 (no mermaid fence on this one)");
const slide1Html = presentationShadow().querySelector(".preview").innerHTML;
assert(slide1Html.includes("<h1>Welcome</h1>"), "slide 1's own heading renders as real HTML");
assert(!slide1Html.includes("Architecture"), "slide 2's content is NOT shown while on slide 1 - real slide-by-slide splitting, not one continuous scroll");
assert(presentationShadow().querySelector("#indicator").textContent === "Slide 1 of 3", "the nav indicator reflects the real slide count and position");
assert(presentationShadow().querySelector("#prev-btn").disabled, "Prev is disabled on the first slide");
assert(!presentationShadow().querySelector("#next-btn").disabled, "Next is enabled - there are more slides");

presentationShadow().querySelector("#next-btn").click();
const finishedRenderingSlide2 = await waitUntil(() => !presentationShadow().querySelector(".preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide2, "the real dynamic import(\"mermaid\") plus attempted render (falling back in this environment) completes within a reasonable time on slide 2, not hung");
const slide2Html = presentationShadow().querySelector(".preview").innerHTML;
assert(slide2Html.includes("<h1>Architecture</h1>"), "slide 2's own heading renders now that Next was tapped");
assert(
  slide2Html.includes("mermaid-fallback") && slide2Html.includes("couldn"),
  "happy-dom genuinely cannot render a sequenceDiagram here either (getBBox() unsupported, throws directly) - the real per-slide fallback path renders, same reasoning as Design's"
);
assert(presentationShadow().querySelector("#indicator").textContent === "Slide 2 of 3", "the indicator advances with Next");
assert(!presentationShadow().querySelector("#prev-btn").disabled, "Prev is enabled once past the first slide");
assert(!presentationShadow().querySelector("#next-btn").disabled, "Next is still enabled - there's a third slide");

presentationShadow().querySelector("#next-btn").click();
const finishedRenderingSlide3 = await waitUntil(() => !presentationShadow().querySelector(".preview").innerHTML.includes("Rendering…"));
assert(finishedRenderingSlide3, "the real attempted render for slide 3's flowchart completes within a reasonable time, not hung");
const slide3Html = presentationShadow().querySelector(".preview").innerHTML;
assert(slide3Html.includes("<h1>Flowchart</h1>"), "slide 3's own heading renders now that Next was tapped again");
assert(
  slide3Html.includes("mermaid-fallback") && slide3Html.includes("couldn"),
  "the flowchart case is now caught too - mermaid.render() resolves here instead of throwing, but isWellFormedSvg() (core/markdown.ts) rejects the malformed result and routes into the same real fallback, not broken/partial markup"
);
assert(presentationShadow().querySelector("#indicator").textContent === "Slide 3 of 3", "the indicator advances again");
assert(!presentationShadow().querySelector("#prev-btn").disabled, "Prev is enabled on the last slide");
assert(presentationShadow().querySelector("#next-btn").disabled, "Next is disabled on the true last slide");

// control-presentation-generator (justjs#123) is cached the same way -
// proves its own slide position/doc state also survives a real
// keep-alive router tab switch.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  presentationShadow() !== null && presentationShadow().querySelector("#indicator").textContent === "Slide 3 of 3",
  "switching away from and back to Workspace preserves the Presentation generator's real slide position - the cached control-presentation-generator instance survives, not recreated"
);

presentationShadow().querySelector("#file-path").value = "src/main.js";
presentationShadow().querySelector("#create-btn").click();
await sleep(20);
assert(presentationShadow().querySelector("#create-error").textContent.includes("already exists"), "Create file reuses the real pathExists() collision check, same as Design's");

presentationShadow().querySelector("#file-path").value = "slides.md";
presentationShadow().querySelector("#create-btn").click();
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
// Presentation's function list -> the Workspace overview. The first
// back click hits Presentation's own Shadow DOM back button
// (justjs#123), same double-traversal as Design's above.
presentationShadow().querySelector("#header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);
clickWorkspaceOverviewTile("development");
await sleep(20);
const developmentLiveForCli = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(developmentLiveForCli[1].textContent.includes("CLI"), "CLI is the second real, live function under Development");
developmentLiveForCli[1].click();
await sleep(20);
// control-cli-terminal (justjs#122) owns its own Shadow DOM - every
// #cli-* lookup below goes through its shadowRoot instead of the
// light DOM the original hand-rolled markup used.
function cliShadow() {
  return document.querySelector("control-cli-terminal")?.shadowRoot ?? null;
}
assert(cliShadow()?.querySelector("#input") != null, "tapping CLI opens the real terminal directly - no intermediate list");

function runCliLine(line) {
  const input = cliShadow().querySelector("#input");
  input.value = line;
  cliShadow().querySelector("#run-btn").click();
}
function lastCliEntry() {
  const entries = [...cliShadow().querySelectorAll("#transcript .cli-entry")];
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

const cliEntryCountBeforeClear = cliShadow().querySelectorAll("#transcript .cli-entry").length;
assert(cliEntryCountBeforeClear > 0, "the transcript has real history before clearing");
runCliLine("clear");
assert(cliShadow().querySelectorAll("#transcript .cli-entry").length === 0, "clear wipes the real transcript - a client-side built-in, not routed through core/cli.ts");

// The back button lives inside <view-nav-header>'s own nested Shadow
// DOM (control-cli-terminal composes it, justjs#122) - double shadow
// traversal to reach the real .back-btn.
cliShadow().querySelector("#header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
const developmentLiveAfterCli = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(
  developmentLiveAfterCli.length === 3 && developmentLiveAfterCli[1].textContent.includes("CLI"),
  "CLI's own back button returns to Development's function list, not the Workspace overview"
);

// control-cli-terminal (justjs#122) is cached on WorkspaceElement and
// only detached/reattached when navigating within Development itself
// - a real keep-alive router (justjs#94) tab switch never touches that
// subtree at all, so this proves the extraction didn't regress the
// terminal's own real, non-store-backed transcript/cwd state.
developmentLiveAfterCli[1].click();
await sleep(20);
runCliLine("pwd");
const cliCwdBeforeSwitch = lastCliOutput();
const cliEntryCountBeforeSwitch = cliShadow().querySelectorAll("#transcript .cli-entry").length;
assert(cliEntryCountBeforeSwitch > 0, "CLI has real transcript history again after re-entering");
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  cliShadow().querySelectorAll("#transcript .cli-entry").length === cliEntryCountBeforeSwitch,
  "switching away from and back to Workspace preserves the CLI terminal's real transcript - the cached control-cli-terminal instance survives, not recreated"
);
runCliLine("pwd");
assert(lastCliOutput() === cliCwdBeforeSwitch, "CLI's cwd also survives the tab switch, still the same real directory as before switching away");

// Back to Development's function list before continuing to Repository
// below - re-queried fresh since re-entering CLI above replaced the
// previous function-list DOM (the earlier developmentLiveAfterCli
// reference is now detached).
cliShadow().querySelector("#header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
const developmentLiveAfterCliSwitch = [...document.querySelectorAll("#mount-workspace .workspace-function-live")];
assert(developmentLiveAfterCliSwitch.length === 3, "Development's function list is real again after the keep-alive check");

// Repository: a real, recognizable catalog (GitHub/GitLab/Bitbucket via
// @justjs/scm-connect) - migrated onto <control-provider-connector>
// (justjs#124), so every lookup below traverses into its own Shadow
// DOM (and, for the provider grid, the further-nested <view-grid>'s
// own shadow root - a real 3-level nesting: workspace's light DOM ->
// control-provider-connector's shadow -> view-grid's shadow). Same
// real-connect shape Deployment's Cloud already proved, minus AWS's
// two-field/signing special case. No token is set anywhere in this
// run, so this proves the real "paste a token first" error path, not
// a live external network call.
function scmConnectorShadow() {
  return document.querySelector("control-provider-connector")?.shadowRoot ?? null;
}
function scmGridShadow() {
  return scmConnectorShadow()?.querySelector("view-grid")?.shadowRoot ?? null;
}
developmentLiveAfterCliSwitch[2].click();
await sleep(20);
assert(document.getElementById("scm-header").title === "Repository", "Repository opens a real provider grid, not a stub");
const scmProviderTiles = [...scmGridShadow().querySelectorAll(".tile")];
const scmProviderNames = scmProviderTiles.map((el) => el.querySelector(".tile-label").textContent);
assert(
  scmProviderNames.includes("GitHub") && scmProviderNames.includes("GitLab") && scmProviderNames.includes("Bitbucket"),
  `Repository opens a real catalog of actual source-control providers (found ${scmProviderNames.join(", ")})`
);
assert(scmProviderTiles.every((el) => !el.classList.contains("selected")), "no SCM provider shows as Connected before any token is ever saved");

const githubTile = scmGridShadow().querySelector('[data-id="github"]');
githubTile.click();
await sleep(20);
assert(
  scmConnectorShadow().querySelector("view-nav-header").textContent.includes("GitHub"),
  "tapping a provider card opens that provider's own connect screen"
);
const scmForm = scmConnectorShadow().querySelector("view-form");
assert(scmForm.shadowRoot.querySelector('[data-field-id="token"]') !== null, "GitHub shows a single token input, same shape as a bearer-token cloud provider");
assert(
  scmConnectorShadow().querySelector(".settings-disclosure").textContent.includes("Stored only on this device"),
  "the connect screen discloses where the token is stored/sent, same tone as the Anthropic key's settings sheet"
);
scmForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  scmConnectorShadow().querySelector("view-status-line").text.includes("Paste a token first"),
  "connecting with an empty token shows a real, actionable error, not a silent no-op"
);
assert(scmConnectorShadow().querySelector("view-list") === null, "no repository list renders without a real successful connect");

// scmScreen (justjs#124) is cached the same way as the other extracted
// controls - a real keep-alive router tab switch never touches
// #mount-workspace's subtree, so GitHub's detail screen (still showing
// the error above) should survive switching away and back, unlike a
// full stage switch via the overview grid (which explicitly discards
// the cached wrapper - proven separately below).
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Workspace to Editor");
document.querySelector('.nav-btn[data-route="/workspace"]').click();
await sleep(20);
assert(
  scmConnectorShadow().querySelector("view-nav-header")?.textContent.includes("GitHub"),
  "switching away from and back to Workspace preserves the Repository provider detail screen - the cached control-provider-connector instance survives, not recreated"
);

scmConnectorShadow().querySelector("view-nav-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(
  scmConnectorShadow().querySelector("view-nav-header") === null,
  "a provider's own back button returns to the Repository grid, not all the way to Development"
);
document.getElementById("scm-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
assert(
  [...document.querySelectorAll("#mount-workspace .workspace-function-live")][2].textContent.includes("Repository"),
  "the grid's own back button returns to Development's function list, not the Workspace overview"
);

document.querySelector("#workspace-back-btn").click();
await sleep(20);

// Real reset proof, not just asserted: leaving Development entirely via
// the overview grid (unlike the tab-switch above) discards the cached
// scmScreen wrapper (renderOverview's item-select handler, justjs#124)
// since ProviderConnectorControl has no public reset API - re-entering
// Repository should land back on the grid, not GitHub's still-open
// detail screen from before.
clickWorkspaceOverviewTile("development");
await sleep(20);
[...document.querySelectorAll("#mount-workspace .workspace-function-live")][2].click();
await sleep(20);
assert(
  scmConnectorShadow().querySelector("view-nav-header") === null,
  "leaving Development via the overview and coming back to Repository really resets to the provider grid, not GitHub's still-open detail screen"
);
document.getElementById("scm-header").shadowRoot.querySelector(".back-btn").click();
await sleep(20);
document.querySelector("#workspace-back-btn").click();
await sleep(20);

// Restores the state every later section assumes (src/main.js active) -
// touch README.md above didn't change it, but touch cli-test/note.txt
// earlier in this section did.
treeRow("src/main.js").querySelector('[data-action="open"]').click();
await sleep(20);

// 1e. Communication proof - the 6th top-level tab (not nested inside
// Workspace, its own real route/mount/nav button). Same real-connect
// shape Deployment's Cloud/Development's Repository already proved,
// via @justjs/comms-connect this time. No token is set anywhere in
// this run, so this proves the real "paste a token first" error path,
// not a live external network call.
// control-comms-connector (justjs#120) owns its own Shadow DOM - every
// lookup below traverses into it (and, for the provider grid/resource
// rows, further-nested view-grid's/view-list's own shadow roots - a
// real 3-level nesting: #mount-communication (light) ->
// control-comms-connector (shadow) -> view-grid/view-list (each with
// its own further-nested shadow root), same pattern SCM/PM/Cloud/
// Socials already established. Settings stays light-DOM, now a real
// static sibling (justjs#127's own precedent) instead of torn down and
// rebuilt - every #comms-setting-*/#comms-settings-* id below is
// unchanged from before this migration.
function commsConnectorShadow() {
  return document.querySelector("#mount-communication control-comms-connector")?.shadowRoot ?? null;
}
function commsGridShadow() {
  return commsConnectorShadow()?.querySelector("view-grid")?.shadowRoot ?? null;
}
function commsListShadow() {
  return commsConnectorShadow()?.querySelector("view-list")?.shadowRoot ?? null;
}
function clickCommsBackButton() {
  commsConnectorShadow()?.querySelector("view-nav-header")?.shadowRoot?.querySelector(".back-btn")?.click();
}

document.querySelector('.nav-btn[data-route="/communication"]').click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/communication"]').classList.contains("active"), "tapping the Comms tab navigates to the real Communication route");
assert(document.getElementById("mount-communication").classList.contains("active"), "the Communication mount is now the active page");
assert(
  document.querySelector("#comms-main-view .workspace-stage-title").textContent.includes("Communication"),
  "Communication renders its own real provider grid directly, not a stub"
);
const commsProviderTiles = [...commsGridShadow().querySelectorAll(".tile")];
const commsProviderNames = commsProviderTiles.map((el) => el.querySelector(".tile-label").textContent);
assert(
  commsProviderNames.includes("Slack") && commsProviderNames.includes("Discord") && commsProviderNames.includes("Microsoft Teams"),
  `Communication opens a real catalog of actual communication providers (found ${commsProviderNames.join(", ")})`
);
assert(commsProviderTiles.every((el) => !el.classList.contains("selected")), "no communication provider shows as Connected before any token is ever saved");

commsGridShadow().querySelector('[data-id="slack"]').click();
await sleep(20);
assert(
  commsConnectorShadow().querySelector("view-nav-header").textContent.includes("Slack"),
  "tapping a provider card opens that provider's own connect screen"
);
let commsForm = commsConnectorShadow().querySelector("view-form");
assert(commsForm.shadowRoot.querySelector('[data-field-id="token"]') !== null, "Slack shows a single token input, same shape as a bearer-token cloud/SCM provider");
commsForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(20);
assert(
  commsConnectorShadow().querySelector("view-status-line").text.includes("Paste a token first"),
  "connecting with an empty token shows a real, actionable error, not a silent no-op"
);
assert(commsConnectorShadow().querySelector("view-list") === null, "no channel/team list renders without a real successful connect");

clickCommsBackButton();
await sleep(20);
assert(
  commsConnectorShadow().querySelector("view-nav-header") === null,
  "a provider's own back button returns to the Communication grid"
);

// Real Settings screen proof (gear icon on the grid) - 4 real local
// preferences, none of them fake: auto-read (Slack-only, disclosed as
// such in its own label), hide-archived (Slack/Teams-only, same
// disclosure), an auto-refresh interval, and a default provider on
// open. Confirms the settings actually persist across a visit, not
// just that the checkboxes render.
document.getElementById("comms-settings-btn").click();
await sleep(20);
assert(
  document.querySelector("#comms-settings-view .workspace-stage-title").textContent.includes("Settings"),
  "the gear icon opens a real Settings screen, not a stub"
);
assert(
  document.getElementById("comms-setting-auto-read") !== null &&
    document.getElementById("comms-setting-auto-read").nextElementSibling.textContent.includes("Slack"),
  "the auto-read setting is honestly labeled Slack-only, not a generic checkbox implying it works everywhere"
);
assert(
  document.getElementById("comms-setting-hide-archived").nextElementSibling.textContent.includes("Slack") &&
    document.getElementById("comms-setting-hide-archived").nextElementSibling.textContent.includes("Teams"),
  "the hide-archived setting is honestly labeled Slack & Teams only, not claiming Discord support it doesn't have"
);
assert(document.getElementById("comms-setting-refresh-interval") !== null, "a real auto-refresh interval control is present");
assert(document.getElementById("comms-setting-default-provider") !== null, "a real default-provider-on-open control is present");

document.getElementById("comms-setting-auto-read").click();
document.getElementById("comms-setting-auto-read").dispatchEvent(new window.Event("change"));
document.getElementById("comms-setting-default-provider").value = "slack";
document.getElementById("comms-setting-default-provider").dispatchEvent(new window.Event("change"));
document.getElementById("comms-settings-back-btn").click();
await sleep(20);
document.getElementById("comms-settings-btn").click();
await sleep(20);
assert(document.getElementById("comms-setting-auto-read").checked, "the auto-read toggle really persists across a visit, not just in-memory for one render");
assert(document.getElementById("comms-setting-default-provider").value === "slack", "the default-provider preference really persists too");
document.getElementById("comms-settings-back-btn").click();
await sleep(20);

// Real end-to-end mocked-fetch Slack message-thread + auto-read proof -
// a real connect, opening a real channel shows its real message list,
// and with auto-read now on (set above), a real conversations.mark call
// fires automatically - same mocked-fetch, no-real-network-call
// technique the Netlify deploy section already established.
const slackOriginalFetch = globalThis.fetch;
const slackMarkCalls = [];
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const json = (body) => new window.Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url === "https://slack.com/api/conversations.list") {
    return json({ ok: true, channels: [{ id: "C1", name: "general", is_private: false, is_archived: false }] });
  }
  if (url.startsWith("https://slack.com/api/conversations.history")) {
    return json({ ok: true, messages: [{ ts: "111.222", user: "U1", text: "hello there" }] });
  }
  if (url === "https://slack.com/api/conversations.mark") {
    slackMarkCalls.push(JSON.parse(init.body));
    return json({ ok: true });
  }
  throw new Error(`verify_web.mjs: unexpected fetch in the Slack messages mock: ${url}`);
};

commsGridShadow().querySelector('[data-id="slack"]').click();
await sleep(20);
commsForm = commsConnectorShadow().querySelector("view-form");
commsForm.shadowRoot.querySelector('[data-field-id="token"]').value = "fake-slack-token";
commsForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(30);
assert(commsListShadow().querySelector(".resource-open-btn") !== null, "a real successful connect shows the real channel list as drillable rows");
commsListShadow().querySelector(".resource-open-btn").click();
await sleep(30);
assert(
  commsConnectorShadow().querySelector("view-nav-header").textContent.includes("Messages"),
  "tapping a Slack channel opens its own real message thread directly - no intermediate channel-list level, unlike Discord/Teams"
);
assert(
  commsListShadow().querySelector(".resource-name")?.textContent.includes("hello there"),
  "the real message list renders the mocked API's actual message content"
);
assert(slackMarkCalls.length === 1 && slackMarkCalls[0].channel === "C1" && slackMarkCalls[0].ts === "111.222", "auto-read (enabled in Settings above) really called Slack's own conversations.mark with the real channel and latest message timestamp");
globalThis.fetch = slackOriginalFetch;

clickCommsBackButton();
await sleep(20);
clickCommsBackButton();
await sleep(20);

// Real end-to-end mocked-fetch Discord proof - unlike Slack, Discord's
// own connect() only returns guilds, so opening one shows a real
// intermediate channel-list level before reaching messages.
const discordOriginalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  const json = (body) => new window.Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url === "https://discord.com/api/v10/users/@me/guilds") {
    return json([{ id: "G1", name: "my-server", owner: true }]);
  }
  if (url === "https://discord.com/api/v10/guilds/G1/channels") {
    return json([{ id: "chan1", name: "general", type: 0 }]);
  }
  if (url.startsWith("https://discord.com/api/v10/channels/chan1/messages")) {
    return json([{ id: "m1", content: "hey", timestamp: "2026-01-01T00:00:00.000Z", author: { username: "bob" } }]);
  }
  throw new Error(`verify_web.mjs: unexpected fetch in the Discord messages mock: ${url}`);
};

commsGridShadow().querySelector('[data-id="discord"]').click();
await sleep(20);
commsForm = commsConnectorShadow().querySelector("view-form");
commsForm.shadowRoot.querySelector('[data-field-id="token"]').value = "fake-discord-token";
commsForm.shadowRoot.querySelector(".connect-btn").click();
await sleep(30);
commsListShadow().querySelector(".resource-open-btn").click();
await sleep(30);
assert(
  commsConnectorShadow().querySelector("view-nav-header").textContent.includes("Channels"),
  "tapping a Discord guild opens a real intermediate channel-list level, not straight to messages like Slack"
);
assert(commsListShadow().querySelector(".resource-open-btn")?.textContent.includes("general"), "the real channel list shows the mocked API's actual channel");
commsListShadow().querySelector(".resource-open-btn").click();
await sleep(30);
assert(
  commsListShadow().querySelector(".resource-name")?.textContent.includes("hey"),
  "tapping a Discord channel shows its own real message list"
);
globalThis.fetch = discordOriginalFetch;

clickCommsBackButton();
await sleep(20);
clickCommsBackButton();
await sleep(20);
clickCommsBackButton();
await sleep(20);

// control-comms-connector (justjs#120) is a real, static, bind-once
// element (not cached/recreated like workspace.ts's own sub-screens
// had to be) - a real keep-alive router tab switch should trivially
// preserve its internal state, same proof pattern as Socials' own
// keep-alive test right below.
commsGridShadow().querySelector('[data-id="slack"]').click();
await sleep(20);
assert(commsConnectorShadow().querySelector("view-nav-header").textContent.includes("Slack"), "selecting Slack (already connected above) before switching away leaves its detail screen showing");
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Communication to Editor");
document.querySelector('.nav-btn[data-route="/communication"]').click();
await sleep(20);
assert(
  commsConnectorShadow().querySelector("view-nav-header").textContent.includes("Slack"),
  "switching back to Communication still shows Slack's detail screen, not reset to the grid - real keep-alive router proof, not just asserted"
);
clickCommsBackButton();
await sleep(20);
assert(commsConnectorShadow().querySelector("view-nav-header") === null, "back button still returns to the grid after the tab-switch round trip");

document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);

// 1f. Socials proof - the 7th top-level tab (not nested inside
// Workspace, its own real route/mount/nav button), via
// @justjs/social-connect. 3 real, connectable providers with 3
// genuinely different auth shapes (Mastodon's single token, Bluesky's
// 2-field identifier+App Password, Reddit's 2-field client
// ID+secret), plus X/Twitter and LinkedIn shown honestly as not
// available - same treatment Deployment's Cloud already gives
// Cloudflare. No credential is set anywhere in this run, so this
// proves each real provider's own "nothing entered yet" error path,
// not a live external network call.
//
// socials.ts is migrated onto <control-provider-connector>
// (@justjs/provider-connect, justjs#101/justjs#102) - the grid/form/
// status/list all live behind a second, nested layer of Shadow DOM
// now: #mount-socials (light) -> <control-provider-connector>
// (shadow) -> <view-grid>/<view-form>/<view-status-line>/
// <view-nav-header> (each with its own further-nested shadow root).
// These helpers pierce both layers; every other still-unmigrated tab
// below keeps querying its own light DOM directly.
function socialsConnector() {
  return document.querySelector("#mount-socials control-provider-connector");
}
function socialsPageHeaderText() {
  const host = document.querySelector("#mount-socials view-nav-header");
  return host?.shadowRoot?.querySelector(".title")?.textContent ?? "";
}
function socialsGridTiles() {
  return [...(socialsConnector()?.shadowRoot?.querySelector("view-grid")?.shadowRoot?.querySelectorAll(".tile") ?? [])];
}
function clickSocialsGridTile(providerId) {
  socialsConnector()
    ?.shadowRoot?.querySelector("view-grid")
    ?.shadowRoot?.querySelector(`.tile[data-id="${providerId}"]`)
    ?.click();
}
function socialsAtGridStep() {
  return socialsConnector()?.shadowRoot?.querySelector("view-grid") !== null;
}
// The detail header's own light-DOM textContent (a <view-badge> +
// provider-name text node slotted into <view-nav-header>) - same real
// Shadow DOM gotcha documented at length before this migration:
// .textContent on the shadow's <slot> wrapper would return fallback
// markup, not projected content, so this reads the host directly.
function socialsDetailHeaderText() {
  return socialsConnector()?.shadowRoot?.querySelector("view-nav-header")?.textContent ?? "";
}
function clickSocialsBackButton() {
  socialsConnector()
    ?.shadowRoot?.querySelector("view-nav-header")
    ?.shadowRoot?.querySelector(".back-btn")
    ?.click();
}
function socialsFormInput(fieldId) {
  return (
    socialsConnector()?.shadowRoot?.querySelector("view-form")?.shadowRoot?.querySelector(`input[data-field-id="${fieldId}"]`) ??
    null
  );
}
function clickSocialsConnectButton() {
  socialsConnector()?.shadowRoot?.querySelector("view-form")?.shadowRoot?.querySelector(".connect-btn")?.click();
}
function socialsStatusText() {
  return socialsConnector()?.shadowRoot?.querySelector("view-status-line")?.shadowRoot?.querySelector("p")?.textContent ?? "";
}
function socialsHasResourceList() {
  return socialsConnector()?.shadowRoot?.querySelector("view-list") !== null;
}
function socialsHasForm() {
  return socialsConnector()?.shadowRoot?.querySelector("view-form") !== null;
}
function socialsDisclosureText() {
  return socialsConnector()?.shadowRoot?.querySelector(".settings-disclosure")?.textContent ?? "";
}
function socialsUnsupportedText() {
  return socialsConnector()?.shadowRoot?.querySelector(".connect-hint")?.textContent ?? "";
}

document.querySelector('.nav-btn[data-route="/socials"]').click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/socials"]').classList.contains("active"), "tapping the Socials tab navigates to the real Socials route");
assert(document.getElementById("mount-socials").classList.contains("active"), "the Socials mount is now the active page");
assert(socialsPageHeaderText().includes("Socials"), "Socials renders its own real provider grid directly, not a stub");
const socialProviderNames = socialsGridTiles().map((el) => el.querySelector(".tile-label").textContent);
assert(
  socialProviderNames.includes("Mastodon") &&
    socialProviderNames.includes("Bluesky") &&
    socialProviderNames.includes("Reddit") &&
    socialProviderNames.includes("X (Twitter)") &&
    socialProviderNames.includes("LinkedIn"),
  `Socials opens a real catalog of all 5 actual social providers, including the 2 honestly-unsupported ones (found ${socialProviderNames.join(", ")})`
);
assert(socialsGridTiles().every((el) => !el.classList.contains("selected")), "no social provider shows as Connected before any credential is ever saved");

clickSocialsGridTile("mastodon");
await sleep(20);
assert(socialsDetailHeaderText().includes("Mastodon"), "tapping a provider card opens that provider's own connect screen");
assert(socialsFormInput("token") !== null, "Mastodon shows a single token input, same shape as a bearer-token cloud/SCM/comms provider");
clickSocialsConnectButton();
await sleep(20);
assert(
  socialsStatusText().includes("Paste a token first"),
  "connecting Mastodon with an empty token shows a real, actionable error, not a silent no-op"
);
assert(!socialsHasResourceList(), "no resource list renders without a real successful connect");

clickSocialsBackButton();
await sleep(20);
clickSocialsGridTile("bluesky");
await sleep(20);
assert(
  socialsFormInput("identifier") !== null && socialsFormInput("appPassword") !== null,
  "Bluesky shows two real fields (handle/email + App Password), not a single token input"
);
assert(
  socialsDisclosureText().includes("App Password") && socialsDisclosureText().includes("never your actual account password"),
  "Bluesky's disclosure explains the real App Password requirement, not the generic bearer-token copy"
);
clickSocialsConnectButton();
await sleep(20);
assert(socialsStatusText().includes("Enter both"), "connecting Bluesky with empty fields shows a real, actionable error naming what's missing");

clickSocialsBackButton();
await sleep(20);
clickSocialsGridTile("reddit");
await sleep(20);
assert(
  socialsFormInput("clientId") !== null && socialsFormInput("clientSecret") !== null,
  "Reddit shows two real fields (client ID + client secret), matching AWS's own two-field shape"
);
assert(
  socialsDisclosureText().includes("app-level only"),
  "Reddit's disclosure honestly states its client_credentials grant is app-level only, not presented as full personal access"
);
clickSocialsConnectButton();
await sleep(20);
assert(socialsStatusText().includes("Enter both"), "connecting Reddit with empty fields shows a real, actionable error naming what's missing");

clickSocialsBackButton();
await sleep(20);
clickSocialsGridTile("x");
await sleep(20);
assert(!socialsHasForm(), "X (Twitter) shows no connect form at all - no confirmed CORS access, not a form that would silently fail");
assert(
  socialsUnsupportedText().includes("did not return CORS headers"),
  "X (Twitter)'s screen states honestly why it can't connect, not a generic disabled state"
);

clickSocialsBackButton();
await sleep(20);
clickSocialsGridTile("linkedin");
await sleep(20);
assert(!socialsHasForm(), "LinkedIn shows no connect form at all either - no confirmed CORS access");
assert(socialsUnsupportedText().includes("did not return CORS headers"), "LinkedIn's screen also states honestly why it can't connect");

clickSocialsBackButton();
await sleep(20);
assert(socialsAtGridStep(), "a provider's own back button returns to the Socials grid");

// justjs#114 (pilot: SocialsElement now extends the justweb-generated
// SocialsBase) - real proof the keep-alive router (justjs#94) still
// preserves <control-provider-connector>'s internal step/selection
// state across a tab switch, not just within the Socials tab itself.
// Real DOM verification (happy-dom), the same trusted method this
// whole file already uses for everything else - not a lesser
// substitute for a live browser, the actual mechanism under test
// (DefaultRouter's per-route container reuse) is exercised identically
// either way.
clickSocialsGridTile("mastodon");
await sleep(20);
assert(socialsDetailHeaderText().includes("Mastodon"), "selecting Mastodon before switching away leaves its detail screen showing");
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Socials to Editor");
document.querySelector('.nav-btn[data-route="/socials"]').click();
await sleep(20);
assert(
  socialsDetailHeaderText().includes("Mastodon"),
  "switching back to Socials still shows Mastodon's detail screen, not reset to the grid - real keep-alive router proof, not just asserted"
);
clickSocialsBackButton();
await sleep(20);
assert(socialsAtGridStep(), "back button still returns to the grid after the tab-switch round trip");

document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);

// 1g. Cartoon Generator proof - the 8th top-level tab (not nested
// inside Workspace, its own real route/mount/nav button), via
// @justjs/image-connect. Architecturally different from every other
// provider tab: the real action is "generate" (always billed), not
// "connect and list resources" (always free) - connect() proofs use
// the real no-credential-yet fast path like every other provider, but
// the real end-to-end generate() flow needs a mocked-fetch technique
// (same as the Netlify-deploy/PM-connector rounds) since there's no
// "empty state" to fall back to for a real image result.
document.querySelector('.nav-btn[data-route="/cartoon"]').click();
await sleep(20);
assert(document.querySelector('.nav-btn[data-route="/cartoon"]').classList.contains("active"), "tapping the Cartoon tab navigates to the real Cartoon route");
assert(document.getElementById("mount-cartoon").classList.contains("active"), "the Cartoon mount is now the active page");
assert(
  document.querySelector("#mount-cartoon .workspace-stage-title").textContent.includes("Cartoon Generator"),
  "Cartoon Generator renders its own real provider grid directly, not a stub"
);
const cartoonProviderCards = [...document.querySelectorAll("#mount-cartoon .provider-card")];
const cartoonProviderNames = cartoonProviderCards.map((el) => el.querySelector(".provider-name").textContent);
assert(
  cartoonProviderNames.includes("OpenAI") && cartoonProviderNames.includes("Stability AI") && cartoonProviderNames.includes("Google Gemini"),
  `Cartoon Generator opens a real catalog of all 3 actual image-generation providers (found ${cartoonProviderNames.join(", ")})`
);
assert(cartoonProviderCards.every((el) => !el.classList.contains("selected")), "no provider shows as Connected before any API key is ever saved");

const openAiCard = document.querySelector('[data-cartoon-provider-id="openai"]');
openAiCard.click();
await sleep(20);
assert(document.getElementById("cartoon-connect-token") !== null, "OpenAI shows a single API key input, same shape as a bearer-token cloud provider");
document.getElementById("cartoon-connect-btn").click();
await sleep(20);
assert(
  document.getElementById("cartoon-connect-status").textContent.includes("Paste an API key first"),
  "connecting OpenAI with an empty key shows a real, actionable error, not a silent no-op"
);
assert(document.getElementById("cartoon-generate-section").hidden, "no generate button/image renders before a real successful connect");

document.getElementById("cartoon-back-btn").click();
await sleep(20);
const geminiCard = document.querySelector('[data-cartoon-provider-id="gemini"]');
geminiCard.click();
await sleep(20);
assert(document.getElementById("cartoon-connect-token") !== null, "Google Gemini also shows a single API key input");
document.getElementById("cartoon-connect-btn").click();
await sleep(20);
assert(
  document.getElementById("cartoon-connect-status").textContent.includes("Paste an API key first"),
  "connecting Gemini with an empty key shows the same real, actionable error"
);
document.getElementById("cartoon-back-btn").click();
await sleep(20);

// Real end-to-end mocked-fetch Stability AI proof - chosen as the one
// fully-proved provider since it has the most real distinct mechanics
// (a real credit-balance connect status, a real multipart/form-data
// generate body, a real structured style_preset field) - no real
// network call, and critically no real billed generation ever happens
// in this suite.
const stabilityOriginalFetch = globalThis.fetch;
let capturedFormData = null;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const json = (body) => new window.Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (url === "https://api.stability.ai/v1/user/balance") {
    return json({ credits: 24.5 });
  }
  if (url === "https://api.stability.ai/v2beta/stable-image/generate/core") {
    capturedFormData = init.body;
    return json({ image: "ZmFrZS1wbmctYnl0ZXM=", finish_reason: "SUCCESS" });
  }
  throw new Error(`verify_web.mjs: unexpected fetch in the Stability cartoon mock: ${url}`);
};

const stabilityCard = document.querySelector('[data-cartoon-provider-id="stability"]');
stabilityCard.click();
await sleep(20);
document.getElementById("cartoon-connect-token").value = "fake-stability-key";
document.getElementById("cartoon-connect-btn").click();
await sleep(30);
assert(
  document.getElementById("cartoon-connect-status").textContent.includes("24.5 credits available"),
  "a real successful connect shows Stability's own real credit balance, not just a bare 'connected' label"
);
assert(
  document.querySelector("#cartoon-generate-section .connect-hint")?.textContent.includes("style_preset"),
  "Stability's screen discloses its real, structured style_preset field before generating"
);

document.getElementById("cartoon-generate-btn").click();
await sleep(20);
assert(
  document.getElementById("cartoon-generate-status").textContent.includes("Describe what to draw first"),
  "generating with an empty prompt shows a real, actionable error, not a silent no-op or a wasted billed call"
);

document.getElementById("cartoon-prompt").value = "a fox riding a skateboard";
document.getElementById("cartoon-generate-btn").click();
await sleep(30);
// Node has its own native global FormData (since Node 18), distinct
// from happy-dom's window.FormData - the setup loop above only copies
// a window global onto globalThis when the name isn't already there,
// so the app bundle (running under plain globalThis) actually
// constructs a Node-native FormData, not happy-dom's. Checking against
// the real global FormData class (whichever one is actually in scope),
// not window's, avoids a false negative from comparing two genuinely
// different-but-both-real FormData implementations.
assert(capturedFormData instanceof FormData, "Generate really sends a multipart/form-data body, not JSON, matching Stability's own real API");
assert(capturedFormData.get("prompt") === "a fox riding a skateboard", "the real form data carries the prompt the user actually typed");
assert(capturedFormData.get("style_preset") === "comic-book", "the real form data carries Stability's own real cartoon style_preset value");
const generatedImg = document.querySelector("#mount-cartoon .cartoon-generated-image");
assert(generatedImg !== null && !generatedImg.hidden, "a real successful generate renders the real returned image");
assert(generatedImg.src.startsWith("data:image/png;base64,ZmFrZS1wbmctYnl0ZXM="), "the rendered image's real data URL carries the exact base64 bytes the mocked API returned");
globalThis.fetch = stabilityOriginalFetch;

// CartoonElement now extends CartoonBase (justjs#121, the final
// sub-issue of justjs#113's epic) - a real keep-alive router tab
// switch should preserve the just-generated image and connect status,
// same proof pattern every other migrated tab in this epic already
// established.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Cartoon Generator to Editor");
document.querySelector('.nav-btn[data-route="/cartoon"]').click();
await sleep(20);
assert(
  !document.querySelector("#mount-cartoon .cartoon-generated-image").hidden,
  "switching back to Cartoon Generator still shows the just-generated image, not reset - real keep-alive router proof, not just asserted"
);
assert(
  document.getElementById("cartoon-connect-status").textContent.includes("24.5 credits available"),
  "Stability's detail screen (with its real connect status) also survives the tab switch"
);

document.getElementById("cartoon-back-btn").click();
await sleep(20);
document.querySelector('.nav-btn[data-route="/editor"]').click();
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

// justjs#115 (EditorElement now extends the justweb-generated
// EditorBase) - real proof the keep-alive router (justjs#94) still
// preserves the editor's own in-progress state (active file, cursor
// position) across a tab switch, not just within the Editor tab
// itself. Real DOM verification (happy-dom), same method this whole
// file already uses everywhere else.
document.querySelector('.nav-btn[data-route="/chat"]').click();
await sleep(20);
assert(document.getElementById("mount-chat").classList.contains("active"), "switched away from Editor to Chat");
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
const afterSwitchTextarea = document.querySelector("#editor-textarea");
assert(
  afterSwitchTextarea.value.includes('import { greet }') && treeRow("src/main.js").classList.contains("active"),
  "switching back to Editor still shows src/main.js as the active file, not reset - real keep-alive router proof, not just asserted"
);

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

// 12b. Runtime theme switching from Settings (justjs#131 follow-up) - a
// real <select> change, not just calling setTheme() directly, proving
// the actual UI control works end-to-end.
const themeSelect = document.querySelector("#settings-theme-select");
assert(
  [...themeSelect.options].map((o) => o.value).sort().join(",") === "dark,light",
  "the theme select is populated with both real themes, not hardcoded/empty"
);
const initialThemeOption = themeSelect.value;
assert(initialThemeOption === "light" || initialThemeOption === "dark", "the select opens showing the actual current theme, not a blank/default option");

const nextTheme = initialThemeOption === "dark" ? "light" : "dark";
themeSelect.value = nextTheme;
themeSelect.dispatchEvent(new Event("change", { bubbles: true }));

assert(document.documentElement.getAttribute("data-theme") === nextTheme, "changing the select applies the new theme's data-theme attribute for real");
assert(window.localStorage.getItem("justjs:ai-editor:theme") === nextTheme, "changing the select persists the new theme, same key toggleTheme() uses");
assert(
  document.documentElement.style.getPropertyValue("--bg") === (nextTheme === "dark" ? "#000000" : "#f2f2f7"),
  "changing the select applies the real tokens theming strategy's CSS custom properties, not just the attribute"
);
assert(
  document.querySelector("#theme-toggle-btn .icon-sun").hidden === (nextTheme !== "dark") &&
  document.querySelector("#theme-toggle-btn .icon-moon").hidden === (nextTheme === "dark"),
  "the nav bar's toggle icon stays in sync when the theme is changed from Settings instead"
);

// Nav toggle changing the theme must sync the select back, the reverse
// direction of the same two-controls-one-state proof.
document.getElementById("theme-toggle-btn").click();
const afterToggleTheme = document.documentElement.getAttribute("data-theme");
assert(afterToggleTheme === initialThemeOption, "the nav toggle flips back to the original theme");
assert(themeSelect.value === afterToggleTheme, "the Settings select reflects a theme change made from the nav toggle, not just its own changes");

document.querySelector("#settings-close-btn").click();
assert(document.getElementById("settings-panel").hidden, "close button hides the settings sheet");

// 13. No-API-key error states - every AI action must fail loudly and
// specifically (pointing at Settings), never silently no-op. No real
// network call happens anywhere in this section.
//
// editor.ts is migrated onto <view-status-line> (justjs#104) - its
// text/hidden state now lives inside that element's Shadow DOM, not as
// a light-DOM #editor-status[hidden] element like the 4 other still-
// unmigrated copies (scaffold.ts, workspace.ts x2, review.ts).
function editorStatusText() {
  return document.querySelector("#editor-status")?.shadowRoot?.querySelector("p")?.textContent ?? "";
}
function editorStatusHidden() {
  return document.querySelector("#editor-status")?.shadowRoot?.querySelector("p")?.hidden ?? true;
}

document.querySelector('.nav-btn[data-route="/editor"]').click();
document.querySelector("#editor-suggest-btn").click();
await sleep(20);
assert(editorStatusText().includes("Add an Anthropic API key"), "Suggest with no key shows a real, actionable error");

document.querySelector("#editor-review-btn").click();
await sleep(20);
assert(editorStatusText().includes("Add an Anthropic API key"), "Review with no key shows the same actionable error");

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

// justjs#116 (ChatElement now extends the justweb-generated ChatBase) -
// real proof the keep-alive router (justjs#94) still preserves the
// chat transcript across a tab switch away from and back to Chat.
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Chat to Editor");
document.querySelector('.nav-btn[data-route="/chat"]').click();
await sleep(20);
assert(
  [...document.querySelectorAll(".chat-message")].length === chatMessages.length,
  "switching back to Chat still shows the same transcript, not reset - real keep-alive router proof, not just asserted"
);

document.querySelector('.nav-btn[data-route="/scaffold"]').click();
document.querySelector("#scaffold-description").value = "a debounce function";
document.querySelector("#scaffold-file-path").value = "src/debounce.js";
document.querySelector("#scaffold-generate-btn").click();
await sleep(20);
assert(document.querySelector("#scaffold-status").textContent.includes("Add an Anthropic API key"), "Scaffold New File with no key shows the same actionable error");
assert(document.querySelector("#scaffold-result").hidden, "no result panel is shown when generation never ran");

// scaffold.ts's New File/New Project toggle is migrated onto
// <view-toggle> (justjs#107) - the two buttons now live inside its
// shadow root as data-value-tagged buttons, not light-DOM
// #scaffold-mode-file-btn/#scaffold-mode-project-btn ids.
function clickScaffoldModeButton(value) {
  document
    .querySelector("#scaffold-mode-toggle")
    ?.shadowRoot?.querySelector(`.toggle-btn[data-value="${value}"]`)
    ?.click();
}

clickScaffoldModeButton("project");
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
clickScaffoldModeButton("file");
assert(document.querySelector("#scaffold-description-mic-btn") === null, "Scaffold New File's mic button correctly doesn't render either");
clickScaffoldModeButton("project");
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

// review.ts is migrated onto <view-image-attach>/<view-image-picker>
// (justjs#105/justjs#109) - the real file input now lives inside
// <view-image-attach>'s shadow root (no light-DOM #review-image-input
// id anymore), and the preview lives inside <view-image-picker>'s
// shadow root as a real .preview element, only rendered when dataUrl
// is set (rather than a light-DOM element toggling .hidden). chat.ts
// and scaffold.ts haven't migrated yet, so they keep using
// attachFakeImage()/getElementById() against their still-light-DOM
// markup unchanged.
async function attachFakeImageToReview(bytes, filename, mediaType) {
  const input = document.querySelector("#review-image-attach")?.shadowRoot?.querySelector("input");
  const file = new window.File([bytes], filename, { type: mediaType });
  const dataTransfer = new window.DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
  return sleep(50);
}
function reviewImagePreviewVisible() {
  return document.querySelector("#review-image-picker")?.shadowRoot?.querySelector(".preview") !== null;
}

document.querySelector('.nav-btn[data-route="/review"]').click();
await attachFakeImageToReview("fake-jpeg-bytes", "error.jpg", "image/jpeg");
assert(reviewImagePreviewVisible(), "Review's attach-screenshot control shows a live preview too");
document.querySelector("#review-run-btn").click();
await sleep(30);
assert(document.querySelector("#review-status").textContent.includes("Add an Anthropic API key"), "Review with an attached screenshot still hits the no-key error path");
assert(!reviewImagePreviewVisible(), "Review's attachment also clears after running, regardless of outcome");

// justjs#117 (ReviewElement now extends the justweb-generated
// ReviewBase) - real proof the keep-alive router (justjs#94) still
// preserves the review status message (local-only DOM state, never
// stored in FeatureStore - a stronger discriminator than the
// store-backed state justjs#115/#116's own keep-alive checks used,
// since a genuine remount-on-switch would reset this specifically)
// across a tab switch away from and back to Review.
const reviewStatusBeforeSwitch = document.querySelector("#review-status").textContent;
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Review to Editor");
document.querySelector('.nav-btn[data-route="/review"]').click();
await sleep(20);
assert(
  document.querySelector("#review-status").textContent === reviewStatusBeforeSwitch,
  "switching back to Review still shows the same status message, not reset - real keep-alive router proof, not just asserted"
);

document.querySelector('.nav-btn[data-route="/scaffold"]').click();
clickScaffoldModeButton("project");
await attachFakeImage("#scaffold-project-image-input", "fake-webp-bytes", "mockup.webp", "image/webp");
assert(!document.getElementById("scaffold-project-image-preview").hidden, "Scaffold New Project's attach-screenshot control shows a live preview too");
document.querySelector("#scaffold-project-description").value = "build this UI";
document.querySelector("#scaffold-generate-project-btn").click();
await sleep(30);
assert(document.querySelector("#scaffold-status").textContent.includes("Add an Anthropic API key"), "Scaffold New Project with an attached screenshot still hits the no-key error path");
assert(document.getElementById("scaffold-project-image-preview").hidden, "Scaffold's attachment also clears after generating, regardless of outcome");

// justjs#118 (ScaffoldElement now extends the justweb-generated
// ScaffoldBase) - real proof the keep-alive router (justjs#94) still
// preserves the New File/New Project mode (local-only DOM state, never
// stored in FeatureStore, same stronger-discriminator shape as
// justjs#117's own check) across a tab switch away from and back to
// Scaffold. Currently in "project" mode from the attach-screenshot
// test just above.
assert(!document.getElementById("scaffold-project-mode").hidden, "Scaffold is in New Project mode before switching away");
document.querySelector('.nav-btn[data-route="/editor"]').click();
await sleep(20);
assert(document.getElementById("mount-editor").classList.contains("active"), "switched away from Scaffold to Editor");
document.querySelector('.nav-btn[data-route="/scaffold"]').click();
await sleep(20);
assert(
  !document.getElementById("scaffold-project-mode").hidden && document.getElementById("scaffold-file-mode").hidden,
  "switching back to Scaffold still shows New Project mode, not reset to New File - real keep-alive router proof, not just asserted"
);

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
  assert(editorStatusHidden(), "a successful real call clears the status line");
} else {
  console.log(
    "skipping live Anthropic call proof (set AI_CODE_EDITOR_LIVE_TEST=1 and ANTHROPIC_API_KEY to run it - costs a real, billed API call)"
  );
}

console.log("\nALL CHECKS PASSED");
