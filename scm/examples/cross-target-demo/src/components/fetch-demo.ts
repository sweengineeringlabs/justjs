import { justjs } from "@justjs/application";

interface FetchedUser {
  name: string;
  email: string;
}

// Exercises the real Network -> Transport chain via justjs.apiAdapter
// (built by boot() from @justjs/network's createFetchAdapter(), per
// @justjs/transport's real ApiAdapter contract) - not a raw fetch() call
// narrated as if it went through those layers.
export class FetchDemoElement extends HTMLElement {
  connectedCallback(): void {
    this.innerHTML = `<div><button id="fetch-btn">fetch</button><pre id="fetch-result"></pre></div>`;
    this.querySelector("#fetch-btn")?.addEventListener("click", () => {
      const resultEl = this.querySelector("#fetch-result")!;
      resultEl.textContent = "loading...";
      justjs
        .apiAdapter!.get<FetchedUser>("https://jsonplaceholder.typicode.com/users/1")
        .then((res) => {
          resultEl.textContent = JSON.stringify({ status: res.status, data: res.data }, null, 2);
        })
        .catch((e: unknown) => {
          resultEl.textContent = `fetch failed: ${String(e)}`;
        });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-fetch")) {
  customElements.define("x-fetch", FetchDemoElement);
}
