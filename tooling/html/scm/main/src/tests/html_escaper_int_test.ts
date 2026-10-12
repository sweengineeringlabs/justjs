import { expect, test } from "bun:test"
import { justjs } from "@justjs/application"
import { createHtmlEscaper, escapeHtml } from "../saf/index.js"

test.each(["core", "bun"])("%s escapes HTML characters, preserving Unicode and empty input", (strategy) => {
  const escape = (text: string) => escapeHtml(text, strategy)
  expect(escape('&<>"')).toBe("&amp;&lt;&gt;&quot;")
  expect(escape("'")).toMatch(/^&#(?:39|x27);$/)
  expect(escape("雪 😀")).toBe("雪 😀")
  expect(escape("")).toBe("")
})

test("HTML escaping switches by strategy name", () => {
  justjs.providers.register({ concern: "htmlEscaper", strategy: "fixture", factory: () => ({ escape: (text: string) => `escaped:${text}` }) })
  expect(escapeHtml("input", "fixture")).toBe("escaped:input")
  expect(() => createHtmlEscaper("missing")).toThrow('Unknown HTML escaper strategy "missing"')
})
