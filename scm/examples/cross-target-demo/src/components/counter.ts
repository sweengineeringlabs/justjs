import type { FeatureStore } from "@justjs/data";

export interface CounterState {
  count: number;
}
export interface IncrementAction {
  type: "increment";
}

// Same reactive convention already proven cross-target this session
// (js-runtime's StoreProbeElement): a plain custom element with a
// `set dataContext(ctx)` accessor. component_registry_adapter.ts assigns
// `element.dataContext = dataContext` on every render() call regardless
// of platform - this element never needs to know whether it's running in
// a browser tab or an Android WebView.
export class CounterElement extends HTMLElement {
  private unsubscribe?: () => void;

  set dataContext(ctx: { store?: FeatureStore<CounterState, IncrementAction> } | undefined) {
    this.unsubscribe?.();
    const store = ctx?.store;
    const render = () => {
      const count = store?.state.value.count ?? 0;
      this.innerHTML = `<div>count: <span id="count-value">${count}</span> <button id="inc">increment</button></div>`;
      this.querySelector("#inc")?.addEventListener("click", () => {
        store?.dispatch({ type: "increment" });
      });
    };
    render();
    this.unsubscribe = store?.subscribe(render);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-counter")) {
  customElements.define("x-counter", CounterElement);
}
