import { describe, it, expect } from "bun:test"
import {
  escapeHtml,
  renderComponent,
  renderDeclarativeShadowDom,
} from "../core/renderer.js"
import type { ComponentDefinition, ComponentProps } from "../api/component.js"
import { SSRError } from "../api/component.js"

const mockButton: ComponentDefinition = {
  renderShadowDom(props: ComponentProps) {
    const label = props.label ?? "Button"
    return `<button>${escapeHtml(String(label))}</button>`
  },
}

const mockCard: ComponentDefinition = {
  renderShadowDom(props: ComponentProps) {
    const title = props.title ?? "Card"
    return `<div class="card">
  <h2>${escapeHtml(String(title))}</h2>
  <slot></slot>
</div>`
  },
  renderSlots(slots) {
    return slots
      .map((slot) => `<div slot="${escapeHtml(slot.name)}">${slot.content}</div>`)
      .join("")
  },
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
    it("test_render_button_with_label", () => {
      const result = renderComponent("x-button", mockButton, { label: "Click me" })

      expect(result.tag).toBe("x-button")
      expect(result.html).toContain('<x-button>')
      expect(result.html).toContain('</x-button>')
      expect(result.html).toContain('<template shadowrootmode="open">')
      expect(result.html).toContain("<button>Click me</button>")
    })

    it("test_render_component_with_default_props", () => {
      const result = renderComponent("x-button", mockButton)

      expect(result.html).toContain("<button>Button</button>")
    })

    it("test_render_component_with_slots", () => {
      const result = renderComponent("x-card", mockCard, { title: "My Card" }, [
        { name: "content", content: "<p>Hello</p>" },
      ])

      expect(result.html).toContain("My Card")
      expect(result.html).toContain("<p>Hello</p>")
      expect(result.lightDom).toHaveLength(1)
      expect(result.lightDom[0]).toEqual({ name: "content", content: "<p>Hello</p>" })
    })

    it("test_render_invalid_tag_throws_error", () => {
      expect(() =>
        renderComponent("button", mockButton, {})
      ).toThrow(SSRError)
    })

    it("test_shadow_dom_contains_proper_formatting", () => {
      const result = renderComponent("x-button", mockButton, { label: "Test" })

      expect(result.html).toContain('shadowrootmode="open"')
      expect(result.shadowDom).toBe("<button>Test</button>")
    })

    it("test_render_escapes_xss_in_props", () => {
      const result = renderComponent("x-button", mockButton, {
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
