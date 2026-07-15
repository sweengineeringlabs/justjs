import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let ImageAttachView: typeof import("../core/image_attach_view.js").ImageAttachView;

beforeAll(async () => {
  ({ ImageAttachView } = await import("../core/image_attach_view.js"));
});

function mount(): InstanceType<typeof ImageAttachView> {
  const el = document.createElement("view-image-attach") as InstanceType<typeof ImageAttachView>;
  document.body.appendChild(el);
  return el;
}

describe("ImageAttachView", () => {
  it("registers as view-image-attach", () => {
    expect(customElements.get("view-image-attach")).toBe(ImageAttachView);
  });

  it("renders a trigger button with the given label", () => {
    const el = mount();
    el.label = "📷 Attach screenshot";
    const button = el.shadowRoot?.querySelector("button");
    expect(button?.textContent).toBe("📷 Attach screenshot");
  });

  it("dispatches files-select with the picked file(s) - a pure relay, no validation", () => {
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>("input");
    expect(input).not.toBeNull();
    const file = new File(["fake-bytes"], "screenshot.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    let detailFiles: unknown;
    el.addEventListener("files-select", (event) => {
      detailFiles = (event as CustomEvent).detail.files;
    });
    input!.dispatchEvent(new Event("change"));
    expect(detailFiles).toBeDefined();
    expect((detailFiles as File[]).length).toBe(1);
    expect((detailFiles as File[])[0]!.name).toBe("screenshot.png");
  });

  it("resets the underlying input's value when reset() is called", () => {
    const el = mount();
    const input = el.shadowRoot?.querySelector<HTMLInputElement>("input");
    Object.defineProperty(input, "value", { value: "C:\\fakepath\\screenshot.png", writable: true, configurable: true });
    el.reset();
    expect(input?.value).toBe("");
  });
});
