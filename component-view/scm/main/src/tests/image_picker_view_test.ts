import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let ImagePickerView: typeof import("../core/image_picker_view.js").ImagePickerView;

beforeAll(async () => {
  ({ ImagePickerView } = await import("../core/image_picker_view.js"));
});

function mount(): InstanceType<typeof ImagePickerView> {
  const el = document.createElement("view-image-picker") as InstanceType<typeof ImagePickerView>;
  document.body.appendChild(el);
  return el;
}

describe("ImagePickerView", () => {
  it("registers as view-image-picker", () => {
    expect(customElements.get("view-image-picker")).toBe(ImagePickerView);
  });

  it("renders nothing when dataUrl is absent and there's no error", () => {
    const el = mount();
    expect(el.shadowRoot?.querySelector(".preview")).toBeNull();
    expect(el.shadowRoot?.querySelector(".error")).toBeNull();
  });

  it("shows the thumbnail and label when dataUrl is set", () => {
    const el = mount();
    el.dataUrl = "data:image/png;base64,AAAA";
    el.label = "Screenshot attached";
    const preview = el.shadowRoot?.querySelector(".preview");
    expect(preview).not.toBeNull();
    expect(el.shadowRoot?.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(el.shadowRoot?.querySelector(".label")?.textContent).toBe("Screenshot attached");
  });

  it("shows the error message when error is set", () => {
    const el = mount();
    el.error = "Image too large (max 4MB).";
    expect(el.shadowRoot?.querySelector(".error")?.textContent).toBe("Image too large (max 4MB).");
  });

  it("dispatches clear when Remove is clicked", () => {
    const el = mount();
    el.dataUrl = "data:image/png;base64,AAAA";
    let fired = false;
    el.addEventListener("clear", () => {
      fired = true;
    });
    el.shadowRoot?.querySelector<HTMLButtonElement>(".remove-btn")?.click();
    expect(fired).toBe(true);
  });
});
