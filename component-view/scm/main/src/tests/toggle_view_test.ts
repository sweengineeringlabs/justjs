import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let ToggleView: typeof import("../core/toggle_view.js").ToggleView;

beforeAll(async () => {
  ({ ToggleView } = await import("../core/toggle_view.js"));
});

const OPTIONS = [
  { value: "file", label: "New File" },
  { value: "project", label: "New Project" },
];

function mount(): InstanceType<typeof ToggleView> {
  const el = document.createElement("view-toggle") as InstanceType<typeof ToggleView>;
  document.body.appendChild(el);
  return el;
}

describe("ToggleView", () => {
  it("registers as view-toggle", () => {
    expect(customElements.get("view-toggle")).toBe(ToggleView);
  });

  it("renders activeValue's option as active", () => {
    const el = mount();
    el.options = OPTIONS;
    el.activeValue = "project";
    const buttons = [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".toggle-btn") ?? [])];
    const fileBtn = buttons.find((b) => b.dataset.value === "file");
    const projectBtn = buttons.find((b) => b.dataset.value === "project");
    expect(fileBtn?.classList.contains("active")).toBe(false);
    expect(projectBtn?.classList.contains("active")).toBe(true);
  });

  it("dispatches change with the clicked option's value", () => {
    const el = mount();
    el.options = OPTIONS;
    el.activeValue = "file";
    let detailValue: string | undefined;
    el.addEventListener("change", (event) => {
      detailValue = (event as CustomEvent).detail.value;
    });
    const projectBtn = [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".toggle-btn") ?? [])].find(
      (b) => b.dataset.value === "project"
    );
    projectBtn?.click();
    expect(detailValue).toBe("project");
  });

  it("does not self-mutate activeValue on click - the host must set it again", () => {
    const el = mount();
    el.options = OPTIONS;
    el.activeValue = "file";
    const projectBtn = [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".toggle-btn") ?? [])].find(
      (b) => b.dataset.value === "project"
    );
    projectBtn?.click();
    expect(el.activeValue).toBe("file");
    const fileBtnStillActive = [...(el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".toggle-btn") ?? [])].find(
      (b) => b.dataset.value === "file"
    );
    expect(fileBtnStillActive?.classList.contains("active")).toBe(true);
  });
});
