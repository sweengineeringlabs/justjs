// Real DOM verification (not just "the bundle compiled") - happy-dom is
// already trusted by this codebase for the same purpose (see
// component_registry_adapter.ts's comment re: ADR-0005, and
// cross-target-demo/verify_web.mjs, which established this pattern for
// example apps in this repo). Loads the real Vite-built bundle against a
// real data-ddas-id-bearing DOM, matching index.html's markup exactly,
// and checks actual post-boot state - each assertion below is chosen to
// prove something the app-under-test could plausibly get wrong, not just
// that a search box renders.
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
    <h1>agentic-memory-demo</h1>
    <button id="settings-btn" type="button">Settings</button>
    <nav class="nav">
      <button class="nav-btn active" data-route="/chat">Chat</button>
      <button class="nav-btn" data-route="/dashboard">Dashboard</button>
      <button class="nav-btn" data-route="/curation">Curation</button>
    </nav>
    <div id="mount-chat" class="page active" data-ddas-id="agentic-memory-demo:home:x-chat:root"></div>
    <div id="mount-dashboard" class="page" data-ddas-id="agentic-memory-demo:home:x-dashboard:root"></div>
    <div id="mount-curation" class="page" data-ddas-id="agentic-memory-demo:home:x-curation:root"></div>
    <div id="settings-panel" hidden>
      <div id="settings-backdrop"></div>
      <div class="settings-sheet">
        <div class="settings-sheet-header">
          <h2>Voice input language</h2>
          <button id="settings-close-btn" type="button">close</button>
        </div>
        <input id="settings-lang-search" type="text" />
        <div id="settings-lang-list"></div>
        <div id="settings-lang-pagination"></div>
        <label id="settings-tts-row" hidden>
          <input id="settings-tts-toggle" type="checkbox" />
        </label>
      </div>
    </div>
  </div>
`;

const distFile = readdirSync("./dist/assets").find((f) => f.endsWith(".js"));
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

// 1. Boot proof
assert(document.title === "agentic-memory-demo: mounted", `document.title is "${document.title}"`);
assert(document.getElementById("mount-chat").innerHTML.length > 0, "chat mount has content");
assert(document.getElementById("mount-dashboard").innerHTML.length > 0, "dashboard mount has content");
assert(document.getElementById("mount-curation").innerHTML.length > 0, "curation mount has content");

// 1b. Settings / voice-language picker proof - the settings panel
// isn't tied to the router (no data-ddas-id mount), so it's just a
// plain DOM element set up once at boot by app.ts's
// setupSettingsPanel(), tested directly rather than through a route.
// One tap on the gear shows the paginated language list directly - an
// earlier version required a second tap on a field to open a separate
// modal; collapsed into one sheet after that proved to be an extra,
// unnecessary click. 21 curated languages, 6 per page = 4 pages
// (6,6,6,3).
document.querySelector("#settings-btn").click();
assert(!document.getElementById("settings-panel").hidden, "one tap on the gear opens the settings sheet");
let langRows = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")];
assert(langRows.length === 6, `the sheet shows the paginated language list immediately, no extra click (found ${langRows.length} rows)`);
assert(document.getElementById("settings-lang-pagination").textContent.includes("Page 1 of 4"), "pagination reads Page 1 of 4 for 21 languages at 6 per page");
assert(langRows.some((r) => r.classList.contains("active") && r.textContent.includes("Auto")), "Auto is marked active with no stored preference, on page 1");

document.querySelector("#lang-page-next").click();
langRows = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")];
assert(document.getElementById("settings-lang-pagination").textContent.includes("Page 2 of 4"), "Next advances to page 2");
assert(
  langRows.length === 6 && !langRows.some((r) => r.textContent.includes("Auto")),
  "page 2 shows a different 6 languages, not page 1's Auto"
);

langRows.find((r) => r.dataset.code === "es-ES").click();
assert(!document.getElementById("settings-panel").hidden, "picking a language updates the list in place, it doesn't close the sheet");
// renderLangPage() rebuilds #settings-lang-list's innerHTML on every
// pick (to move the checkmark), which detaches the row element just
// clicked - re-query the freshly-rendered row rather than reuse that
// now-stale reference.
const updatedSpanishRow = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")].find((r) => r.dataset.code === "es-ES");
assert(
  updatedSpanishRow.classList.contains("active") && updatedSpanishRow.querySelector(".lang-picker-check"),
  "the picked language is immediately marked active with a checkmark, without leaving the page"
);
assert(window.localStorage.getItem("justjs:memory-demo:voice-lang") === "es-ES", "the picked language is persisted to localStorage");

document.querySelector("#settings-close-btn").click();
assert(document.getElementById("settings-panel").hidden, "close button hides the settings sheet");

document.querySelector("#settings-btn").click();
assert(
  document.getElementById("settings-lang-pagination").textContent.includes("Page 2 of 4"),
  "re-opening the sheet jumps straight to the page containing the persisted selection, not back to page 1"
);
langRows = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")];
assert(langRows.find((r) => r.dataset.code === "es-ES").classList.contains("active"), "the persisted language is marked active on that page");

document.querySelector("#lang-page-prev").click();
assert(document.getElementById("settings-lang-pagination").textContent.includes("Page 1 of 4"), "Prev returns to page 1");

// Search filters the same paged list rather than replacing it with an
// unpaged scroll - a narrow match collapses to a single page instead
// of a special "search results" layout.
const langSearchInput = document.getElementById("settings-lang-search");
langSearchInput.value = "spanish";
langSearchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
langRows = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")];
assert(
  langRows.length === 2 && langRows.every((r) => r.textContent.includes("Spanish")),
  `searching "spanish" narrows the list to just the 2 Spanish variants (found ${langRows.map((r) => r.textContent).join(", ")})`
);
assert(document.getElementById("settings-lang-pagination").textContent === "", "a 2-result search fits on one page - no pagination controls shown");

langSearchInput.value = "klingon";
langSearchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
assert(
  document.querySelector("#settings-lang-list").textContent.includes('No languages match "klingon"'),
  "a search with no matches shows a real empty state, not a blank list"
);

langSearchInput.value = "";
langSearchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
langRows = [...document.querySelectorAll("#settings-lang-list .lang-picker-row")];
assert(
  langRows.length === 6 && langRows.some((r) => r.textContent.includes("Auto")),
  "clearing the search restores the full paged list from page 1"
);

document.querySelector("#settings-close-btn").click();
assert(document.getElementById("settings-panel").hidden, "close button hides the settings panel");

// 2. Chat / recall proof
document.querySelector("#chat-input").value = "I love hiking on weekends";
document.querySelector("#chat-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
let chatMessages = [...document.querySelectorAll(".chat-message")];
assert(chatMessages.some((m) => m.classList.contains("user") && m.textContent.includes("hiking on weekends")), "first user message rendered");
assert(chatMessages.some((m) => m.classList.contains("assistant") && m.textContent.includes("Noted")), "first assistant reply is a plain acknowledgement (no prior memory)");

document.querySelector("#chat-input").value = "hiking is my favorite weekend activity";
document.querySelector("#chat-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
chatMessages = [...document.querySelectorAll(".chat-message")];
const secondReply = chatMessages.filter((m) => m.classList.contains("assistant")).at(-1);
assert(secondReply.textContent.includes("hiking on weekends"), "second assistant reply recalls the FIRST message's real content, proving query() actually retrieved a prior record");

// 3. Dashboard proof - widget overview first (drill-down architecture:
// the tab opens on a widget grid, not a form - each concern is a
// separate view reached by tapping a widget or the sub-nav).
document.querySelector('.nav-btn[data-route="/dashboard"]').click();
await new Promise((r) => setTimeout(r, 50));
assert(
  document.querySelector("#widget-total-value").textContent === "2",
  `overview widget shows total=2 for the two chat-authored records (found "${document.querySelector("#widget-total-value").textContent}")`
);

document.querySelector("#widget-search").click();
await new Promise((r) => setTimeout(r, 50));
let rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 2, `entering Search with no filters browses all - shows both chat-authored records (found ${rows.length})`);

document.querySelector("#dashboard-filter-text").value = "hiking on weekends";
document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 1, `text filter narrows to 1 result (found ${rows.length})`);

document.querySelector('.dash-subnav-btn[data-view="add"]').click();
await new Promise((r) => setTimeout(r, 20));
document.querySelector("#dashboard-add-kind").value = "structured";
document.querySelector("#dashboard-add-tags").value = "test-tag";
document.querySelector("#dashboard-add-content").value = "a manually added structured memory";
document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
assert(!document.querySelector("#dashboard-add-confirm").hidden, "add view shows a confirmation after a successful add");

// Image attachment proof - a File is attached via input.files (using a
// real DataTransfer, not a direct property hack) and dispatched as a
// genuine 'change' event, exercising the real
// FileReader.readAsDataURL() pipeline happy-dom actually implements,
// not a mocked shortcut. Added then immediately deleted in this same
// block so it doesn't shift the exact record counts later assertions
// (analytics breakdown, browse pagination) depend on.
const imageInput = document.querySelector("#dashboard-add-image");
const fakeImageFile = new window.File(["fake-png-bytes"], "screenshot.png", { type: "image/png" });
const dataTransfer = new window.DataTransfer();
dataTransfer.items.add(fakeImageFile);
imageInput.files = dataTransfer.files;
imageInput.dispatchEvent(new window.Event("change", { bubbles: true }));
await new Promise((r) => setTimeout(r, 50));
assert(!document.querySelector("#dashboard-add-image-preview").hidden, "selecting an image shows a live preview");
assert(
  document.querySelector("#dashboard-add-image-thumb").src.startsWith("data:image/png"),
  "the preview thumbnail is a real data URL read from the file, not a placeholder"
);

// Leave content blank - an attached image is a real memory on its own,
// content shouldn't be a hard requirement when there's a photo.
document.querySelector("#dashboard-add-content").value = "";
document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));

document.querySelector('.dash-subnav-btn[data-view="browse"]').click();
await new Promise((r) => setTimeout(r, 50));
rows = [...document.querySelectorAll("#dashboard-results .memory-row")];
const imageRow = rows.find((r) => r.querySelector(".memory-image"));
assert(!!imageRow, "the newly added image-only record renders with a visible thumbnail in its card");
assert(
  imageRow.querySelector(".memory-content").textContent === "📷 Image memory",
  "a blank content field falls back to a real caption when an image is attached, not an empty string"
);
assert(
  imageRow.querySelector(".memory-image").src.startsWith("data:image/png"),
  "the rendered thumbnail is the same data URL that was read from the file"
);

const imageRecordId = imageRow.dataset.id;
assert(
  JSON.parse(window.localStorage.getItem("justjs:memory-demo:images") || "{}")[imageRecordId] !== undefined,
  "the image is persisted to its own localStorage entry, keyed by record id"
);

imageRow.querySelector(".memory-delete").click();
await new Promise((r) => setTimeout(r, 50));
assert(
  JSON.parse(window.localStorage.getItem("justjs:memory-demo:images") || "{}")[imageRecordId] === undefined,
  "deleting the record also cleans up its stored image, not leaving an orphaned entry"
);

document.querySelector('.dash-subnav-btn[data-view="search"]').click();
await new Promise((r) => setTimeout(r, 50));
document.querySelector("#dashboard-filter-kind").value = "structured";
document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 1, "structured-kind filter shows the newly added record");
const addedId = rows[0].dataset.id;

document.querySelector(`.memory-edit[data-id="${addedId}"]`).click();
await new Promise((r) => setTimeout(r, 20));
document.querySelector(`#edit-content-${addedId}`).value = "edited content";
document.querySelector(`#edit-save-${addedId}`).click();
await new Promise((r) => setTimeout(r, 50));
const editedRow = document.querySelector(`.memory-row[data-id="${addedId}"] .memory-content`);
assert(editedRow.textContent === "edited content", "edit saved and reflected on re-search");

document.querySelector(`.memory-delete[data-id="${addedId}"]`).click();
await new Promise((r) => setTimeout(r, 50));
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 0, "delete removes the record from a subsequent search");

// 4. Semantic search proof
document.querySelector('.dash-subnav-btn[data-view="add"]').click();
await new Promise((r) => setTimeout(r, 20));
document.querySelector("#dashboard-add-kind").value = "structured";
for (const content of ["I enjoy trail running", "long distance running on weekends", "trying to eat more vegetables"]) {
  document.querySelector("#dashboard-add-content").value = content;
  document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
}

document.querySelector('.dash-subnav-btn[data-view="search"]').click();
await new Promise((r) => setTimeout(r, 50));
document.querySelector("#dashboard-filter-semantic").checked = true;
document.querySelector("#dashboard-filter-text").value = "jogging outdoors";
document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
rows = [...document.querySelectorAll("#dashboard-results .memory-row")];
const scored = rows.map((r) => ({
  content: r.querySelector(".memory-content").textContent,
  score: parseFloat(r.querySelector(".memory-score")?.textContent ?? "0"),
}));
const runningScores = scored.filter((r) => r.content.includes("running")).map((r) => r.score);
const dietScore = scored.find((r) => r.content.includes("vegetables"))?.score ?? 0;
assert(runningScores.length === 2 && runningScores.every((s) => s > 0), "both running-related records score > 0 against a differently-worded related query");
assert(runningScores.every((s) => s > dietScore), "running-related records score higher than the unrelated diet record - proves the fake-embedding+cosine math actually differentiates topics");

// Analytics proof - open the widget-kind drill-down and check the
// breakdown reflects real current data: 2 untagged episodic (chat) +
// 3 structured (the running/veggie records just added; the earlier
// "test-tag" structured record was deleted above), 0 semantic.
document.querySelector('.dash-subnav-btn[data-view="analytics"]').click();
await new Promise((r) => setTimeout(r, 50));
const kindBars = [...document.querySelectorAll("#analytics-kind .widget-bar-row")].map((row) => ({
  label: row.querySelector(".widget-bar-label").textContent,
  count: row.querySelector(".widget-bar-count").textContent,
}));
assert(
  kindBars.find((b) => b.label === "episodic")?.count === "2" && kindBars.find((b) => b.label === "structured")?.count === "3",
  `analytics kind breakdown reflects real current data (found ${JSON.stringify(kindBars)})`
);

// 5. Curation proof
// dashboard.ts's addRecord() clears #dashboard-add-tags after every
// successful submit (normal form-reset UX) - re-set it on every loop
// iteration, not just once before the loop, or only the first record
// actually ends up tagged.
document.querySelector('.dash-subnav-btn[data-view="add"]').click();
await new Promise((r) => setTimeout(r, 20));
for (const content of ["ate a salad", "skipped dessert", "drank more water"]) {
  document.querySelector("#dashboard-add-kind").value = "episodic";
  document.querySelector("#dashboard-add-tags").value = "diet";
  document.querySelector("#dashboard-add-content").value = content;
  document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
}

document.querySelector('.nav-btn[data-route="/curation"]').click();
document.querySelector("#curation-run-btn").click();
await new Promise((r) => setTimeout(r, 100));
let log = document.querySelector("#curation-log").textContent;
assert(log.includes("Consolidated") && log.includes("diet"), `curation log mentions consolidating the diet tag (log: "${log}")`);
let created = document.querySelectorAll("#curation-created li");
let deleted = document.querySelectorAll("#curation-deleted li");
assert(created.length === 1, `exactly 1 record created (found ${created.length})`);
assert(deleted.length === 3, `exactly 3 records deleted (found ${deleted.length})`);

// 6. Idempotency proof
document.querySelector("#curation-run-btn").click();
await new Promise((r) => setTimeout(r, 100));
log = document.querySelector("#curation-log").textContent;
assert(log.includes("No consolidation or forgetting candidates"), "second immediate run finds no candidates - the freshly-created summary is not re-swept");

// Analytics reflects the consolidation, not stale pre-curation data:
// the 3 diet-tagged notes were deleted and replaced by 1 structured
// summary tagged ["diet", "consolidated"] - top tags should show both
// at count 1, not the pre-curation "diet" x3.
document.querySelector('.nav-btn[data-route="/dashboard"]').click();
document.querySelector('.dash-subnav-btn[data-view="analytics"]').click();
await new Promise((r) => setTimeout(r, 50));
const topTagsText = document.querySelector("#analytics-top-tags").textContent;
assert(
  topTagsText.includes("consolidated") && topTagsText.includes("diet · 1"),
  `top tags reflect the post-curation summary, not the 3 deleted diet notes (found "${topTagsText}")`
);

// Dashboard results pagination proof - post-curation there are exactly
// 6 records (2 untagged episodic + 3 structured running/veggie notes +
// 1 consolidated summary), and RESULTS_PAGE_SIZE is 5, so Browse's
// unfiltered list is a real, naturally-occurring 2-page case - no need
// to seed extra throwaway records just to exercise pagination.
document.querySelector('.dash-subnav-btn[data-view="browse"]').click();
await new Promise((r) => setTimeout(r, 50));
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 5, `browse page 1 shows RESULTS_PAGE_SIZE (5) of the 6 total records (found ${rows.length})`);
assert(document.getElementById("dashboard-pagination").textContent.includes("Page 1 of 2"), "pagination reads Page 1 of 2 for 6 records at 5 per page");
assert(document.querySelector("#dashboard-page-prev").disabled, "Prev is disabled on page 1");
assert(!document.querySelector("#dashboard-page-next").disabled, "Next is enabled on page 1");

document.querySelector("#dashboard-page-next").click();
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 1, `browse page 2 shows the 1 remaining record (found ${rows.length})`);
assert(document.getElementById("dashboard-pagination").textContent.includes("Page 2 of 2"), "pagination reads Page 2 of 2 after clicking Next");
assert(document.querySelector("#dashboard-page-next").disabled, "Next is disabled on the last page");

document.querySelector("#dashboard-page-prev").click();
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 5, "Prev returns to page 1's 5 records");

// 7. Forgetting proof - real-time costly (this app's provider uses a
// 60s demo-tuned staleAfterMsForForgetting), gated behind an explicit
// opt-in so the fast path above stays the default dev-loop check.
if (process.env.VERIFY_FORGETTING === "1") {
  console.log("VERIFY_FORGETTING=1 - waiting ~65s for the demo staleAfterMsForForgetting threshold...");
  await new Promise((r) => setTimeout(r, 65_000));
  document.querySelector("#curation-run-btn").click();
  await new Promise((r) => setTimeout(r, 100));
  log = document.querySelector("#curation-log").textContent;
  assert(log.includes("Forgot"), `curation log mentions forgetting stale untagged notes (log: "${log}")`);

  // dashboard.ts's DashboardElement keeps its own internal view state
  // across nav-tab switches (the .page div's active class toggles, but
  // the component instance - and its `view` field - persists) - it was
  // last left on "browse" above, so a plain dashboard-tab click doesn't
  // show the search form. The sub-nav is how a drill-down view reaches
  // another one directly.
  document.querySelector('.nav-btn[data-route="/dashboard"]').click();
  document.querySelector('.dash-subnav-btn[data-view="search"]').click();
  await new Promise((r) => setTimeout(r, 50));
  rows = [...document.querySelectorAll("#dashboard-results .memory-row")];
  assert(
    !rows.some((r) => r.querySelector(".memory-content").textContent.includes("hiking")),
    "the untagged chat-authored hiking records are gone after forgetting"
  );
} else {
  console.log("skipping forgetting proof (set VERIFY_FORGETTING=1 to run it - costs ~65s real time)");
}

console.log("\nALL CHECKS PASSED");
