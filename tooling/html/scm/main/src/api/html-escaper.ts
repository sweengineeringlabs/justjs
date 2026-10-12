/** Escapes HTML text and quoted attributes, not JavaScript or script blocks. */
export interface HtmlEscaper {
  escape(text: string): string
}
