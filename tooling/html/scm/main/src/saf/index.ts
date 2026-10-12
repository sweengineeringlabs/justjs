import "../spi/bun-escapehtml/index.js"
import { justjs } from "@justjs/application"
import type { HtmlEscaper } from "../api/html-escaper.js"
import { DefaultHtmlEscaper } from "../core/html-escaper.js"
export type { HtmlEscaper } from "../api/html-escaper.js"

justjs.providers.register({ concern: "htmlEscaper", strategy: "core", factory: () => new DefaultHtmlEscaper() })

export function createHtmlEscaper(strategy: string): HtmlEscaper {
  const spec = justjs.providers.resolve("htmlEscaper", strategy)
  if (!spec) throw new Error(`Unknown HTML escaper strategy "${strategy}".`)
  return spec.factory() as HtmlEscaper
}

export function escapeHtml(text: string, strategy = "bun"): string {
  return createHtmlEscaper(strategy).escape(text)
}
