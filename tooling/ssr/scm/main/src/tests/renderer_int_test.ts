import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import {
  escapeHtml,
  renderComponent,
  renderDeclarativeShadowDom,
} from "../core/renderer.js"
import { SSRError } from "../api/component.js"

// renderComponent() constructs a real CustomElementConstructor against
// whatever DOM global is already registered (ADR-0005) — one register per
// test file, matching @justjs/application's own tests, not per render call.
beforeAll(() => {
  GlobalRegistrator.register()
})

afterAll(async () => {
  await GlobalRegistrator.unregister()
})

let cachedMockButton: CustomElementConstructor | undefined
async function loadMockButton(): Promise<CustomElementConstructor> {
  if (!cachedMockButton) {
    class MockButton extends HTMLElement {
      connectedCallback() {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" })
        const label = this.getAttribute("label") ?? "Button"
        shadow.innerHTML = `<button>${escapeHtml(label)}</button>`
      }
    }
    cachedMockButton = MockButton
  }
  return cachedMockButton
}

let cachedMockCard: CustomElementConstructor | undefined
async function loadMockCard(): Promise<CustomElementConstructor> {
  if (!cachedMockCard) {
    class MockCard extends HTMLElement {
      connectedCallback() {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" })
        const title = this.getAttribute("title") ?? "Card"
        shadow.innerHTML = `<div class="card">
  <h2>${escapeHtml(title)}</h2>
  <slot></slot>
</div>`
      }
    }
    cachedMockCard = MockCard
  }
  return cachedMockCard
}

async function loadThrowingComponent(): Promise<CustomElementConstructor> {
  class Throwing extends HTMLElement {
    connectedCallback() {
      throw new Error("boom")
    }
  }
  return Throwing
}

describe("ssr", () => {
  describe("escapeHtml", () => {
    it("test_escape_ampersand", () => {
      expect(escapeHtml("Tom & Jerry")).toBe("Tom &amp; Jerry")
    })

    it("test_escape_angle_brackets", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toContain("&lt;script&gt;")
    })

    it("test_escape_quotes", () => {
      expect(escapeHtml('He said "hello"')).toContain("&quot;")
    })

    it("test_escape_all_special_chars", () => {
      const input = `<div class="test">'&"</div>`
      const output = escapeHtml(input)
      expect(output).not.toContain("<")
      expect(output).not.toContain(">")
      expect(output).not.toContain('"')
    })
  })

  describe("renderComponent", () => {
    it("test_render_button_with_label", async () => {
      const result = await renderComponent("x-button", loadMockButton, { label: "Click me" })

      expect(result.tag).toBe("x-button")
      expect(result.html).toContain("<x-button>")
      expect(result.html).toContain("</x-button>")
      expect(result.html).toContain('<template shadowrootmode="open">')
      expect(result.html).toContain("<button>Click me</button>")
    })

    it("test_render_component_with_default_props", async () => {
      const result = await renderComponent("x-button", loadMockButton)

      expect(result.html).toContain("<button>Button</button>")
    })

    it("test_render_constructs_the_real_class_not_a_hand_written_duplicate", async () => {
      // Proves renderComponent() is driven by the actual class's own
      // connectedCallback logic (ADR-0005), not a parallel string template a
      // developer could let drift out of sync — changing what the class
      // itself renders changes the SSR output with no second implementation
      // to update.
      let renderCount = 0
      class CountingButton extends HTMLElement {
        connectedCallback() {
          renderCount++
          const shadow = this.attachShadow({ mode: "open" })
          shadow.innerHTML = `<button>rendered ${renderCount} time(s)</button>`
        }
      }

      const result = await renderComponent("x-counting-button", async () => CountingButton, {})

      expect(renderCount).toBe(1)
      expect(result.shadowDom).toBe("<button>rendered 1 time(s)</button>")
    })

    it("test_render_component_with_slots", async () => {
      const result = await renderComponent("x-card", loadMockCard, { title: "My Card" }, [
        { name: "content", content: "<p>Hello</p>" },
      ])

      expect(result.html).toContain("My Card")
      expect(result.html).toContain("<p>Hello</p>")
      expect(result.lightDom).toHaveLength(1)
      expect(result.lightDom[0]).toEqual({ name: "content", content: "<p>Hello</p>" })
    })

    it("test_render_invalid_tag_throws_error", async () => {
      await expect(renderComponent("button", loadMockButton, {})).rejects.toThrow(SSRError)
    })

    it("test_render_propagates_a_component_construction_error", async () => {
      // No ErrorBoundary concept exists in @justjs/ssr (ADR-0005 is scoped to
      // string output, not the @justjs/application Lifecycle) - a component
      // that throws during connectedCallback fails the render outright.
      await expect(renderComponent("x-throwing", loadThrowingComponent, {})).rejects.toThrow(
        "boom"
      )
    })

    it("test_shadow_dom_contains_proper_formatting", async () => {
      const result = await renderComponent("x-button", loadMockButton, { label: "Test" })

      expect(result.html).toContain('shadowrootmode="open"')
      expect(result.shadowDom).toBe("<button>Test</button>")
    })

    it("test_render_escapes_xss_in_props", async () => {
      const result = await renderComponent("x-button", loadMockButton, {
        label: '<script>alert("xss")</script>',
      })

      expect(result.html).not.toContain("<script>")
      expect(result.html).toContain("&lt;script&gt;")
    })
  })

  describe("renderDeclarativeShadowDom", () => {
    it("test_render_dsd_with_shadow_content", () => {
      const html = renderDeclarativeShadowDom(
        "x-custom",
        "<div>Custom content</div>"
      )

      expect(html).toContain("<x-custom>")
      expect(html).toContain("</x-custom>")
      expect(html).toContain('<template shadowrootmode="open">')
      expect(html).toContain("Custom content")
    })

    it("test_render_dsd_with_light_dom", () => {
      const html = renderDeclarativeShadowDom(
        "x-custom",
        "<slot></slot>",
        "<p>Light DOM content</p>"
      )

      expect(html).toContain("<p>Light DOM content</p>")
      expect(html).toContain("<slot></slot>")
    })

    it("test_multiline_shadow_dom_indented", () => {
      const shadowDom = `<div class="wrapper">
  <h1>Title</h1>
  <slot></slot>
</div>`

      const html = renderDeclarativeShadowDom("x-test", shadowDom)

      expect(html).toContain('    <div class="wrapper">')
      expect(html).toContain("    </div>")
    })
  })
})
