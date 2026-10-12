import { expect, test } from "bun:test"
import { justjs } from "@justjs/application"
import { createTomlParser, parseToml } from "../saf/index.js"

test("TOML consumers select a registered implementation by strategy", () => {
  justjs.providers.register({ concern: "tomlParser", strategy: "fixture", factory: () => ({ parse: (content: string) => ({ content }) }) })
  expect(parseToml("opaque input", "fixture")).toEqual({ content: "opaque input" })
  expect(parseToml('url = "https://example.com/?key=value"', "bun")).toEqual({ url: "https://example.com/?key=value" })
  expect(() => createTomlParser("missing")).toThrow('Unknown TOML parser strategy "missing"')
})
