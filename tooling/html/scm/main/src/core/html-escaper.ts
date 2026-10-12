import type { HtmlEscaper } from "../api/html-escaper.js"

export class DefaultHtmlEscaper implements HtmlEscaper {
  escape(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
  }
}
