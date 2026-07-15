import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let GridView: typeof import("../core/grid_view.js").GridView;

beforeAll(async () => {
  ({ GridView } = await import("../core/grid_view.js"));
});

function mount(): InstanceType<typeof GridView> {
  const el = document.createElement("view-grid") as InstanceType<typeof GridView>;
  document.body.appendChild(el);
  return el;
}

describe("GridView", () => {
  it("registers as view-grid", () => {
    expect(customElements.get("view-grid")).toBe(GridView);
  });

  it("renders a plain icon tile when badgeColor is absent", () => {
    const el = mount();
    el.items = [{ id: "ideation", label: "Ideation", icon: "💡" }];
    const tile = el.shadowRoot?.querySelector(".tile");
    expect(tile?.querySelector(".tile-icon")?.textContent).toBe("💡");
    expect(tile?.querySelector("view-badge")).toBeNull();
    expect(tile?.querySelector(".tile-label")?.textContent).toBe("Ideation");
  });

  it("composes a view-badge tile when badgeColor is present", () => {
    const el = mount();
    el.items = [{ id: "aws", label: "AWS", icon: "☁️", badgeColor: "#FF9900" }];
    const tile = el.shadowRoot?.querySelector(".tile");
    expect(tile?.querySelector(".tile-icon")).toBeNull();
    const badge = tile?.querySelector("view-badge") as { color?: string; icon?: string } | null;
    expect(badge).not.toBeNull();
    expect(badge?.color).toBe("#FF9900");
    expect(badge?.icon).toBe("☁️");
  });

  it("reflects the selected prop visually as the .selected class", () => {
    const el = mount();
    el.items = [
      { id: "a", label: "A", selected: true },
      { id: "b", label: "B", selected: false },
    ];
    const tiles = [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".tile") ?? [])];
    expect(tiles.find((t) => t.dataset.id === "a")?.classList.contains("selected")).toBe(true);
    expect(tiles.find((t) => t.dataset.id === "b")?.classList.contains("selected")).toBe(false);
  });

  it("dispatches item-select with the clicked tile's id", () => {
    const el = mount();
    el.items = [
      { id: "ideation", label: "Ideation" },
      { id: "requirement", label: "Requirement" },
    ];
    let detailId: string | undefined;
    el.addEventListener("item-select", (event) => {
      detailId = (event as CustomEvent).detail.id;
    });
    const requirementTile = [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".tile") ?? [])].find(
      (t) => t.dataset.id === "requirement"
    );
    requirementTile?.click();
    expect(detailId).toBe("requirement");
  });

  it("does not self-mutate selected on click - the host must set it again", () => {
    const el = mount();
    el.items = [{ id: "a", label: "A", selected: false }];
    const tile = el.shadowRoot?.querySelector<HTMLElement>(".tile");
    tile?.click();
    expect(el.items[0]!.selected).toBe(false);
    expect(el.shadowRoot?.querySelector(".tile")?.classList.contains("selected")).toBe(false);
  });
});
