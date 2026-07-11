// Real DOM verification (not just "the bundle compiled") - happy-dom is
// already trusted by this codebase for the same purpose (see
// component_registry_adapter.ts's comment re: ADR-0005). Loads the real
// Vite-built bundle against a real data-ddas-id-bearing DOM, matching
// index.html's markup exactly, and checks actual post-boot state.
import { Window } from "happy-dom";
import { readdirSync } from "fs";

const nodeFetch = globalThis.fetch;

const window = new Window({ url: "http://localhost/" });
const document = window.document;
// Copy every window global onto globalThis (MutationObserver,
// customElements, HTMLElement, etc.) rather than hand-picking a subset -
// Vite's own build output (modulepreload polyfill) needs more of the DOM
// surface than just what this app's own code touches directly.
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
// happy-dom's own fetch needs a real network stack config; use Node's
// built-in fetch directly instead - same real HTTPS call either way.
globalThis.fetch = nodeFetch;

document.body.innerHTML = `
  <div id="app">
    <h1>cross-target-demo</h1>
    <div id="mount-counter" data-ddas-id="cross-target-demo:home:x-counter:root"></div>
    <div id="mount-fetch" data-ddas-id="cross-target-demo:home:x-fetch:root"></div>
  </div>
`;

const distFile = readdirSync("./dist/assets").find((f) => f.endsWith(".js"));
const bundlePath = `./dist/assets/${distFile}`;
console.log("loading bundle:", bundlePath);

await import(new URL(bundlePath, import.meta.url).href);

// main() is async and fires on module evaluation - give it a tick to
// finish boot()/navigate() before checking state.
await new Promise((r) => setTimeout(r, 200));

console.log("document.title:", document.title);
console.log("counter mount innerHTML:", document.getElementById("mount-counter").innerHTML);
console.log("fetch mount innerHTML:", document.getElementById("mount-fetch").innerHTML);

const incBtn = document.querySelector("#mount-counter #inc");
if (incBtn) {
  incBtn.click();
  incBtn.click();
  await new Promise((r) => setTimeout(r, 50));
  console.log("after 2 clicks, counter mount innerHTML:", document.getElementById("mount-counter").innerHTML);
} else {
  console.log("no #inc button found in counter mount - real bug, not expected");
}

const fetchBtn = document.querySelector("#mount-fetch #fetch-btn");
if (fetchBtn) {
  fetchBtn.click();
  await new Promise((r) => setTimeout(r, 2000));
  console.log("after fetch click, result:", document.querySelector("#mount-fetch #fetch-result").textContent);
} else {
  console.log("no #fetch-btn found - real bug, not expected");
}
