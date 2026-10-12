import { justjs } from "@justjs/application"
import type { HtmlEscaper } from "../../api/html-escaper.js"

export class BunHtmlEscaper implements HtmlEscaper {
  constructor() {
    if (typeof Bun === "undefined" || typeof Bun.escapeHTML !== "function") {
      throw new Error('HTML escaper strategy "bun" requires Bun >=1.4.2. Run SSR/build tooling with bun, or register and select another HtmlEscaper strategy.')
    }
  }

  escape(text: string): string {
    return Bun.escapeHTML(text)
  }
}

justjs.providers.register({ concern: "htmlEscaper", strategy: "bun", factory: () => new BunHtmlEscaper() })
