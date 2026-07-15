import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node", "CustomEvent"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let NavHeaderView: typeof import("../core/nav_header_view.js").NavHeaderView;

beforeAll(async () => {
  ({ NavHeaderView } = await import("../core/nav_header_view.js"));
});

function mount(): InstanceType<typeof NavHeaderView> {
  const el = document.createElement("view-nav-header") as InstanceType<typeof NavHeaderView>;
  document.body.appendChild(el);
  return el;
}

describe("NavHeaderView", () => {
  it("registers as view-nav-header", () => {
    expect(customElements.get("view-nav-header")).toBe(NavHeaderView);
  });

  it("renders title-only with no back button when backLabel is unset", () => {
    const el = mount();
    el.icon = "🌐";
    el.title = "Socials";
    expect(el.shadowRoot?.querySelector(".back-btn")).toBeNull();
    const slot = el.shadowRoot?.querySelector(".title slot");
    expect(slot?.textContent).toBe("🌐 Socials");
  });

  it("renders a back button with the given label when backLabel is set", () => {
    const el = mount();
    el.title = "Repository";
    el.backLabel = "Workspace";
    const backBtn = el.shadowRoot?.querySelector(".back-btn");
    expect(backBtn).not.toBeNull();
    expect(backBtn?.textContent).toBe("← Workspace");
  });

  it("dispatches a nav-back event when the back button is clicked", () => {
    const el = mount();
    el.title = "Repository";
    el.backLabel = "Workspace";
    let fired = false;
    el.addEventListener("nav-back", () => {
      fired = true;
    });
    const backBtn = el.shadowRoot?.querySelector<HTMLButtonElement>(".back-btn");
    backBtn?.click();
    expect(fired).toBe(true);
  });

  it("escapes title and backLabel text to prevent markup injection", () => {
    const el = mount();
    el.title = "<script>alert(1)</script>";
    el.backLabel = "<img>";
    const shadowHtml = el.shadowRoot?.innerHTML ?? "";
    expect(shadowHtml).not.toContain("<script>alert(1)</script>");
    expect(shadowHtml).not.toContain("<img>");
    expect(shadowHtml).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(shadowHtml).toContain("&lt;img&gt;");
  });
});
