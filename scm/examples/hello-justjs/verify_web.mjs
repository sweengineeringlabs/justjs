import { Window } from "happy-dom";
import { readdirSync } from "node:fs";

const window = new Window({ url: "http://localhost/" });
const document = window.document;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) { try { globalThis[key] = window[key]; } catch {} }
}
globalThis.window = window;
globalThis.document = document;
document.body.innerHTML = `<div id="app">
  <div class="nav"><button class="nav-btn active" data-page="counter">Counter</button><button class="nav-btn" data-page="fetch">Fetch Data</button><button class="nav-btn" data-page="form">Form</button></div>
  <div id="counter-page" class="page"></div><div id="fetch-page" class="page" style="display:none"></div><div id="form-page" class="page" style="display:none"></div>
  <div id="log-output"></div></div>`;

const entry = readdirSync("./dist/assets").find((file) => /^index-.*\.js$/.test(file));
if (!entry) throw new Error("Vite entry bundle was not found");
await import(new URL(`./dist/assets/${entry}`, import.meta.url).href);
document.dispatchEvent(new window.Event("DOMContentLoaded"));
for (let attempt = 0; attempt < 100 && !document.querySelector("#counter-page x-counter #increment"); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
const counter = document.querySelector("#counter-page x-counter");
if (!counter) throw new Error("Counter route did not mount");
counter.querySelector("#increment").click();
if (counter.querySelector("#counter-value").textContent !== "1") throw new Error("Counter interaction did not update state");

document.querySelector('.nav-btn[data-page="form"]').click();
await new Promise((resolve) => setTimeout(resolve, 20));
const formMount = document.querySelector("#form-page x-form");
if (!formMount) throw new Error("Form route did not mount after navigation");
const form = formMount.querySelector("form");
form?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
await new Promise((resolve) => setTimeout(resolve, 20));
if (!formMount.textContent.toLowerCase().includes("required")) throw new Error("Form validation did not render required-field errors");
console.log("hello-justjs browser checks passed: generated routes mount, counter updates, and form validation runs.");
