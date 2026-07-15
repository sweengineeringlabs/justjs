import { describe, it, expect, beforeAll } from "bun:test";
import { Window } from "happy-dom";

const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}

let PromptFieldView: typeof import("../core/prompt_field_view.js").PromptFieldView;

beforeAll(async () => {
  ({ PromptFieldView } = await import("../core/prompt_field_view.js"));
});

function mount(): InstanceType<typeof PromptFieldView> {
  const el = document.createElement("view-prompt-field") as InstanceType<typeof PromptFieldView>;
  document.body.appendChild(el);
  return el;
}

describe("PromptFieldView", () => {
  it("registers as view-prompt-field", () => {
    expect(customElements.get("view-prompt-field")).toBe(PromptFieldView);
  });

  it("renders no label when label is unset (the bare cartoon.ts case)", () => {
    const el = mount();
    expect(el.shadowRoot?.querySelector(".field-label")).toBeNull();
  });

  it("renders the label text when set", () => {
    const el = mount();
    el.label = "Describe the file to generate";
    expect(el.shadowRoot?.querySelector(".field-label")?.textContent).toBe("Describe the file to generate");
  });

  it("applies placeholder and rows to the textarea", () => {
    const el = mount();
    el.placeholder = "e.g. a fox riding a skateboard";
    el.rows = 5;
    const textarea = el.shadowRoot?.querySelector("textarea");
    expect(textarea?.placeholder).toBe("e.g. a fox riding a skateboard");
    expect(Number(textarea?.rows)).toBe(5);
  });

  it("populates the textarea when value is set, and reads it back", () => {
    const el = mount();
    el.value = "a debounce utility function";
    expect(el.shadowRoot?.querySelector("textarea")?.value).toBe("a debounce utility function");
    expect(el.value).toBe("a debounce utility function");
  });

  it("reads back live-typed textarea content, not just what was last set", () => {
    const el = mount();
    el.value = "initial";
    const textarea = el.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "user typed this instead";
    expect(el.value).toBe("user typed this instead");
  });

  it("preserves in-progress typed text across a rows/placeholder change", () => {
    const el = mount();
    const textarea = el.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.value = "don't lose me";
    el.rows = 6;
    expect(el.shadowRoot?.querySelector("textarea")?.value).toBe("don't lose me");
  });
});
