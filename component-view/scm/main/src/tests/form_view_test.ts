import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let FormView: typeof import("../core/form_view.js").FormView;

beforeAll(async () => {
  ({ FormView } = await import("../core/form_view.js"));
});

function mount(): InstanceType<typeof FormView> {
  const el = document.createElement("view-form") as InstanceType<typeof FormView>;
  document.body.appendChild(el);
  return el;
}

describe("FormView", () => {
  it("registers as view-form", () => {
    expect(customElements.get("view-form")).toBe(FormView);
  });

  it("renders a single input for a 1-field bearer-token form", () => {
    const el = mount();
    el.fields = [{ id: "token", type: "password", placeholder: "Paste your API key" }];
    const inputs = [...(el.shadowRoot?.querySelectorAll("input") ?? [])];
    expect(inputs.length).toBe(1);
    expect(inputs[0]?.type).toBe("password");
    expect(inputs[0]?.placeholder).toBe("Paste your API key");
  });

  it("renders two inputs for a 2-field form (e.g. Bluesky)", () => {
    const el = mount();
    el.fields = [
      { id: "identifier", type: "text", placeholder: "Bluesky handle or email" },
      { id: "appPassword", type: "password", placeholder: "App Password" },
    ];
    const inputs = [...(el.shadowRoot?.querySelectorAll("input") ?? [])];
    expect(inputs.length).toBe(2);
    expect(inputs[0]?.type).toBe("text");
    expect(inputs[1]?.type).toBe("password");
  });

  it("dispatches submit with values keyed by each field's id", () => {
    const el = mount();
    el.fields = [
      { id: "identifier", type: "text", placeholder: "Bluesky handle or email" },
      { id: "appPassword", type: "password", placeholder: "App Password" },
    ];
    const inputs = [...(el.shadowRoot?.querySelectorAll<HTMLInputElement>("input") ?? [])];
    inputs[0]!.value = "user.bsky.social";
    inputs[1]!.value = "xxxx-xxxx-xxxx-xxxx";
    let detailValues: Record<string, string> | undefined;
    el.addEventListener("submit", (event) => {
      detailValues = (event as CustomEvent).detail.values;
    });
    el.shadowRoot?.querySelector<HTMLButtonElement>(".connect-btn")?.click();
    expect(detailValues).toEqual({ identifier: "user.bsky.social", appPassword: "xxxx-xxxx-xxxx-xxxx" });
  });

  it("disables the Connect button while connecting, without changing its label", () => {
    const el = mount();
    el.fields = [{ id: "token", type: "password", placeholder: "token" }];
    const btn = el.shadowRoot?.querySelector<HTMLButtonElement>(".connect-btn");
    expect(btn?.disabled).toBe(false);
    expect(btn?.textContent).toBe("Connect");
    el.connecting = true;
    const btnAfter = el.shadowRoot?.querySelector<HTMLButtonElement>(".connect-btn");
    expect(btnAfter?.disabled).toBe(true);
    expect(btnAfter?.textContent).toBe("Connect");
  });

  it("shows Disconnect only when connected, and relabels Connect to Reconnect", () => {
    const el = mount();
    el.fields = [{ id: "token", type: "password", placeholder: "token" }];
    expect(el.shadowRoot?.querySelector(".disconnect-btn")).toBeNull();
    el.connected = true;
    expect(el.shadowRoot?.querySelector(".connect-btn")?.textContent).toBe("Reconnect");
    expect(el.shadowRoot?.querySelector(".disconnect-btn")).not.toBeNull();
  });

  it("dispatches disconnect when Disconnect is clicked", () => {
    const el = mount();
    el.fields = [{ id: "token", type: "password", placeholder: "token" }];
    el.connected = true;
    let fired = false;
    el.addEventListener("disconnect", () => {
      fired = true;
    });
    el.shadowRoot?.querySelector<HTMLButtonElement>(".disconnect-btn")?.click();
    expect(fired).toBe(true);
  });
});
