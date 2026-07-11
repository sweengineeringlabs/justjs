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
    <nav class="nav">
      <button class="nav-btn active" data-route="/chat">Chat</button>
      <button class="nav-btn" data-route="/dashboard">Dashboard</button>
      <button class="nav-btn" data-route="/curation">Curation</button>
    </nav>
    <div id="mount-chat" class="page active" data-ddas-id="agentic-memory-demo:home:x-chat:root"></div>
    <div id="mount-dashboard" class="page" data-ddas-id="agentic-memory-demo:home:x-dashboard:root"></div>
    <div id="mount-curation" class="page" data-ddas-id="agentic-memory-demo:home:x-curation:root"></div>
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

// 3. Dashboard proof
document.querySelector('.nav-btn[data-route="/dashboard"]').click();
document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
let rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 2, `browse-all shows both chat-authored records (found ${rows.length})`);

document.querySelector("#dashboard-filter-text").value = "hiking on weekends";
document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
await new Promise((r) => setTimeout(r, 50));
rows = document.querySelectorAll("#dashboard-results .memory-row");
assert(rows.length === 1, `text filter narrows to 1 result (found ${rows.length})`);
document.querySelector("#dashboard-filter-text").value = "";

document.querySelector("#dashboard-add-kind").value = "structured";
document.querySelector("#dashboard-add-tags").value = "test-tag";
document.querySelector("#dashboard-add-content").value = "a manually added structured memory";
document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
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
document.querySelector("#dashboard-filter-kind").value = "any";

// 4. Semantic search proof
document.querySelector("#dashboard-add-kind").value = "structured";
document.querySelector("#dashboard-add-tags").value = "";
for (const content of ["I enjoy trail running", "long distance running on weekends", "trying to eat more vegetables"]) {
  document.querySelector("#dashboard-add-content").value = content;
  document.querySelector("#dashboard-add-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await new Promise((r) => setTimeout(r, 30));
}
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
document.querySelector("#dashboard-filter-semantic").checked = false;
document.querySelector("#dashboard-filter-text").value = "";

// 5. Curation proof
// dashboard.ts's addRecord() clears #dashboard-add-tags after every
// successful submit (normal form-reset UX) - re-set it on every loop
// iteration, not just once before the loop, or only the first record
// actually ends up tagged.
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

  document.querySelector('.nav-btn[data-route="/dashboard"]').click();
  document.querySelector("#dashboard-search-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
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
