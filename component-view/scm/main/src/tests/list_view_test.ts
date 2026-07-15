import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let ListView: typeof import("../core/list_view.js").ListView;

beforeAll(async () => {
  ({ ListView } = await import("../core/list_view.js"));
});

function mount(): InstanceType<typeof ListView> {
  const el = document.createElement("view-list") as InstanceType<typeof ListView>;
  document.body.appendChild(el);
  return el;
}

describe("ListView", () => {
  it("registers as view-list", () => {
    expect(customElements.get("view-list")).toBe(ListView);
  });

  it("renders the default emptyMessage when items is empty", () => {
    const el = mount();
    el.items = [];
    expect(el.shadowRoot?.querySelector(".empty")?.textContent).toBe("Connected - no results found.");
    expect(el.shadowRoot?.querySelector(".resource-list")).toBeNull();
  });

  it("renders a custom emptyMessage when set", () => {
    const el = mount();
    el.emptyMessage = "No channels yet.";
    el.items = [];
    expect(el.shadowRoot?.querySelector(".empty")?.textContent).toBe("No channels yet.");
  });

  it("renders name+status rows for non-empty items", () => {
    const el = mount();
    el.items = [
      { id: "repo-1", name: "my-repo", status: "Active" },
      { id: "repo-2", name: "other-repo", status: "Archived" },
    ];
    const rows = [...(el.shadowRoot?.querySelectorAll(".resource-row") ?? [])];
    expect(rows.length).toBe(2);
    expect(rows[0]?.querySelector(".resource-name")?.textContent).toBe("my-repo");
    expect(rows[0]?.querySelector(".resource-status")?.textContent).toBe("Active");
  });

  it("renders plain non-interactive rows when clickable is false", () => {
    const el = mount();
    el.clickable = false;
    el.items = [{ id: "a", name: "A", status: "Active" }];
    expect(el.shadowRoot?.querySelector(".resource-open-btn")).toBeNull();
    expect(el.shadowRoot?.querySelector(".resource-row .resource-name")?.textContent).toBe("A");
  });

  it("renders buttons and dispatches item-select with the correct id when clickable is true", () => {
    const el = mount();
    el.clickable = true;
    el.items = [
      { id: "general", name: "#general", status: "12 unread" },
      { id: "random", name: "#random", status: "0 unread" },
    ];
    let detailId: string | undefined;
    el.addEventListener("item-select", (event) => {
      detailId = (event as CustomEvent).detail.id;
    });
    const randomBtn = [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".resource-open-btn") ?? [])].find(
      (b) => b.dataset.id === "random"
    );
    randomBtn?.click();
    expect(detailId).toBe("random");
  });
});
