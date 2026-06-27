import { describe, it, expect } from "bun:test"
import { SSRRenderer } from "../core/ssr_renderer.js"
import type { ComponentDefinition } from "../api/renderer.js"

describe("SSRRenderer", () => {
  it("test_render_component_with_shadow_dom_disabled", () => {
    const renderer = new SSRRenderer({ declarativeShadowDom: false })
    const component: ComponentDefinition = {
      renderShadowDom() {
        return "<button>Click me</button>"
      },
    }

    const result = renderer.renderComponent("x-button", component, { label: "Click" })

    expect(result.html).toContain("<x-button>")
    expect(result.html).toContain("<button>Click me</button>")
    expect(result.html).not.toContain("shadowrootmode")
  })

  it("test_render_component_with_declarative_shadow_dom", () => {
    const renderer = new SSRRenderer({ declarativeShadowDom: true })
    const component: ComponentDefinition = {
      renderShadowDom() {
        return "<div class='card'>Content</div>"
      },
    }

    const result = renderer.renderComponent("x-card", component, { title: "Card" })

    expect(result.html).toContain("shadowrootmode=\"open\"")
    expect(result.html).toContain("<template shadowrootmode=\"open\">")
    expect(result.html).toContain("<div class='card'>Content</div>")
  })

  it("test_render_hydration_script_includes_component_and_props", () => {
    const renderer = new SSRRenderer()
    const component: ComponentDefinition = {
      renderShadowDom() {
        return "<span>Hello</span>"
      },
    }

    const result = renderer.renderComponent("x-hello", component, { name: "World" })

    expect(result.hydrationScript).toContain("data-hydration=\"x-hello\"")
    expect(result.hydrationScript).toContain("x-hello")
    expect(result.hydrationScript).toContain("World")
  })

  it("test_declarative_shadow_dom_wrapping", () => {
    const renderer = new SSRRenderer()
    const html = renderer.renderDeclarativeShadowDom("x-element", "<p>Content</p>")

    expect(html).toContain("<x-element>")
    expect(html).toContain("<template shadowrootmode=\"open\">")
    expect(html).toContain("<p>Content</p>")
    expect(html).toContain("</template>")
    expect(html).toContain("</x-element>")
  })
})
