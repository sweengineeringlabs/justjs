export type {
  ComponentProps,
  ComponentSlot,
  RenderedComponent,
  LazyCustomElementLoader,
} from "../api/component.js"
export { SSRError } from "../api/component.js"
export { escapeHtml, createHtmlEscaper } from "@justjs/html"
export type { HtmlEscaper } from "@justjs/html"
export { renderDeclarativeShadowDom } from "../core/renderer.js"
import { createHtmlEscaper } from "@justjs/html"
import { renderComponent as render } from "../core/renderer.js"
import type { ComponentProps, ComponentSlot, RenderedComponent, LazyCustomElementLoader } from "../api/component.js"

export function renderComponent(
  tag: string, load: LazyCustomElementLoader, props: ComponentProps = {},
  slots: readonly ComponentSlot[] = [], htmlEscaperStrategy = "bun"
): Promise<RenderedComponent> {
  const escaper = createHtmlEscaper(htmlEscaperStrategy)
  return render(tag, load, props, slots, (text) => escaper.escape(text))
}
