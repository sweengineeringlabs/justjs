import { describe, it, expect } from "bun:test";
// HTMLElement/customElements/document are shimmed globally via
// bunfig.toml's [test].preload (test-dom-shim.ts) - comms_connector.ts
// defines a class extending HTMLElement at module top level.
import { CommsConnectorControl } from "./comms_connector.js";

const PROVIDERS = [
  {
    id: "slack",
    name: "Slack",
    icon: "💬",
    color: "#4A154B",
    connected: false,
    fields: [{ id: "token", type: "password" as const, placeholder: "Paste your Slack token" }],
    resourceListLabel: "Channels",
  },
];

// Direct construction, not document.createElement("control-comms-
// connector") - the shared happy-dom document from this package's own
// test-dom-shim.ts preload doesn't invoke a registered custom element's
// real constructor via createElement() (a real quirk confirmed by
// direct debugging: the resulting element's shadowRoot stayed null even
// though `instanceof`/customElements.get() both showed it as properly
// registered). `new CommsConnectorControl()` is safe here specifically
// because the class is already registered (customElements.define() ran
// at this module's own import) - real spec behavior only forbids
// direct construction of an unregistered autonomous custom element.
function mount(): InstanceType<typeof CommsConnectorControl> {
  const el = new CommsConnectorControl();
  document.body.appendChild(el);
  return el;
}

describe("CommsConnectorControl.resetView() (justjs#137)", () => {
  it("returns to the grid from a provider's detail view", async () => {
    const el = mount();
    el.connect = async () => ({ session: "real" });
    el.list = async () => [{ id: "1", name: "general", status: "active" }];
    el.providers = PROVIDERS;

    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "slack" } }));
    el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "tok" } } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(el.shadowRoot?.querySelector("view-form")).not.toBeNull();

    el.resetView();

    expect(el.shadowRoot?.querySelector("view-form")).toBeNull();
    expect(el.shadowRoot?.querySelector("view-grid")).not.toBeNull();
  });

  it("is a safe no-op when already on the grid", () => {
    const el = mount();
    el.providers = PROVIDERS;
    expect(() => el.resetView()).not.toThrow();
    expect(el.shadowRoot?.querySelector("view-grid")).not.toBeNull();
  });

  it("clears fetched resources so re-selecting an already-connected provider re-fetches fresh instead of showing stale data", async () => {
    const el = mount();
    let listCallCount = 0;
    el.connect = async () => ({ session: "real" });
    el.list = async () => {
      listCallCount++;
      return [{ id: "1", name: "general", status: "active" }];
    };
    el.providers = PROVIDERS;

    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "slack" } }));
    el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "tok" } } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listCallCount).toBe(1);

    el.resetView();

    el.shadowRoot!.querySelector("view-grid")!.dispatchEvent(new CustomEvent("item-select", { detail: { id: "slack" } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listCallCount).toBe(2);
  });

  it("stops the auto-refresh timer - a scheduled refetch never fires again after resetView()", async () => {
    const el = mount();
    let listCallCount = 0;
    el.connect = async () => ({ session: "real" });
    el.list = async () => {
      listCallCount++;
      return [{ id: "1", name: "general", status: "active" }];
    };
    // A real, tiny interval (50ms) - not one of the real UI's 30/60/120s
    // options, but the setter takes a plain number with no validation,
    // and a short real interval is what makes this test fast and real
    // (not a mock/fake timer) rather than needing to wait 30+ real
    // seconds.
    el.refreshIntervalSeconds = 0.05;
    el.providers = PROVIDERS;

    const grid = el.shadowRoot!.querySelector("view-grid")!;
    grid.dispatchEvent(new CustomEvent("item-select", { detail: { id: "slack" } }));
    el.shadowRoot!.querySelector("view-form")!.dispatchEvent(new CustomEvent("submit", { detail: { values: { token: "tok" } } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listCallCount).toBe(1);

    // Let the auto-refresh timer actually fire at least once, proving it
    // was really scheduled.
    await new Promise((resolve) => setTimeout(resolve, 130));
    expect(listCallCount).toBeGreaterThan(1);

    el.resetView();
    const countAtReset = listCallCount;

    // If the timer weren't cleared, this window is long enough for
    // several more real ticks - the whole point of this test.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(listCallCount).toBe(countAtReset);
  });
});
