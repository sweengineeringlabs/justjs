import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let StatusLineView: typeof import("../core/status_line_view.js").StatusLineView;

beforeAll(async () => {
  ({ StatusLineView } = await import("../core/status_line_view.js"));
});

function mount(): InstanceType<typeof StatusLineView> {
  const el = document.createElement("view-status-line") as InstanceType<typeof StatusLineView>;
  document.body.appendChild(el);
  return el;
}

describe("StatusLineView", () => {
  it("registers as view-status-line", () => {
    expect(customElements.get("view-status-line")).toBe(StatusLineView);
  });

  it("renders hidden when text is empty", () => {
    const el = mount();
    const p = el.shadowRoot?.querySelector("p");
    expect(p?.hasAttribute("hidden")).toBe(true);
    expect(p?.textContent).toBe("");
  });

  it("renders visible with the given text when text is non-empty", () => {
    const el = mount();
    el.text = "Thinking…";
    const p = el.shadowRoot?.querySelector("p");
    expect(p?.hasAttribute("hidden")).toBe(false);
    expect(p?.textContent).toBe("Thinking…");
  });

  it("hides again once text is cleared back to empty", () => {
    const el = mount();
    el.text = "Reviewing…";
    el.text = "";
    const p = el.shadowRoot?.querySelector("p");
    expect(p?.hasAttribute("hidden")).toBe(true);
    expect(p?.textContent).toBe("");
  });

  it("escapes text to prevent markup injection", () => {
    const el = mount();
    el.text = "<script>alert(1)</script>";
    const shadowHtml = el.shadowRoot?.innerHTML ?? "";
    expect(shadowHtml).not.toContain("<script>alert(1)</script>");
    expect(shadowHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
