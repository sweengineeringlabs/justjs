import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

// bun test has no real DOM at all - Custom Elements, Shadow DOM,
// HTMLElement all need a real browser-shaped global environment.
// happy-dom (already an established devDependency pattern in this
// monorepo - see cloud-connect's own int test) provides one. Copied
// onto globalThis only when a name isn't already present, matching
// this monorepo's own established shimming convention.
const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let BadgeView: typeof import("../core/badge_view.js").BadgeView;

beforeAll(async () => {
  ({ BadgeView } = await import("../core/badge_view.js"));
});

function mount(): InstanceType<typeof BadgeView> {
  const el = document.createElement("view-badge") as InstanceType<typeof BadgeView>;
  document.body.appendChild(el);
  return el;
}

describe("BadgeView", () => {
  it("registers as view-badge", () => {
    expect(customElements.get("view-badge")).toBe(BadgeView);
  });

  it("renders the icon when no logo is set", () => {
    const el = mount();
    el.color = "#123456";
    el.icon = "🐘";
    const span = el.shadowRoot?.querySelector(".badge");
    expect(span?.innerHTML).toBe("🐘");
    expect(span?.getAttribute("style")).toContain("#123456");
  });

  it("renders the logo with fill=currentColor injected when logo is set", () => {
    const el = mount();
    el.color = "#000000";
    el.logo = '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>';
    const span = el.shadowRoot?.querySelector(".badge");
    expect(span?.innerHTML).toContain('fill="currentColor"');
    expect(span?.innerHTML).toContain('viewBox="0 0 24 24"');
  });

  it("renders nothing (empty glyph) when neither icon nor logo is set", () => {
    const el = mount();
    el.color = "#654321";
    const span = el.shadowRoot?.querySelector(".badge");
    expect(span?.innerHTML).toBe("");
  });

  it("escapes icon text to prevent markup injection", () => {
    const el = mount();
    el.color = "#000000";
    el.icon = "<script>alert(1)</script>";
    const span = el.shadowRoot?.querySelector(".badge");
    expect(span?.innerHTML).not.toContain("<script>");
    expect(span?.innerHTML).toContain("&lt;script&gt;");
  });
});
