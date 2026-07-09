import type { ComponentProps, ComponentSlot, RenderedComponent, LazyCustomElementLoader } from "../api/component.js"
import { SSRError } from "../api/component.js"

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Constructs the real custom element class server-side and reads back
// whatever its own connectedCallback/render logic produced, instead of a
// hand-maintained duplicate of that logic (ADR-0005).
//
// Explicitly self-registers via `customElements.define()` (guarded against
// double-definition) before constructing, rather than assuming the module
// behind `load()` already did it. Confirmed by hand against happy-dom:
// `new ElementCtor()` throws "Illegal constructor" for an autonomous custom
// element class that was never passed to `customElements.define()` — the
// class alone isn't enough, unlike a plain HTMLElement subclass. This is a
// real constraint of the platform's custom-element registry, not a
// happy-dom-specific quirk (`adaptCustomElementRegistry`, application/core/
// registry/component_registry_adapter.ts, does `new ElementCtor()` the same
// way and carries the same unverified assumption client-side — flagged
// separately, not fixed here, since it's pre-existing code this ADR doesn't
// touch).
//
// Requires `document`/`HTMLElement`/`customElements` to already exist as
// globals when called — this module does not register or manage a DOM
// implementation itself. A real SSR process registers one once at startup
// (e.g. `@happy-dom/global-registrator`, exactly as @justjs/application's own
// tests do); registering/unregistering per render call here would make two
// concurrent renderComponent() calls in the same process corrupt each
// other's global state, which is worse than requiring the caller to own a
// single, already-running DOM environment.
async function renderShadowDomFor(
  tag: string,
  load: LazyCustomElementLoader,
  props: ComponentProps
): Promise<string> {
  const ElementCtor = await load()
  if (!customElements.get(tag)) {
    customElements.define(tag, ElementCtor)
  }
  const element = new ElementCtor()
  for (const [key, value] of Object.entries(props)) {
    element.setAttribute(key, String(value))
  }
  document.body.appendChild(element)
  const html = element.shadowRoot?.innerHTML ?? ""
  element.remove()
  return html
}

export async function renderComponent(
  tag: string,
  load: LazyCustomElementLoader,
  props: ComponentProps = {},
  slots: readonly ComponentSlot[] = []
): Promise<RenderedComponent> {
  if (!tag.includes("-")) {
    throw new SSRError(
      `Invalid component tag: ${tag}. Custom elements must include a hyphen.`
    )
  }

  const shadowDom = await renderShadowDomFor(tag, load, props)
  const lightDomContent = slots
    .map((slot) => `<div slot="${escapeHtml(slot.name)}">${slot.content}</div>`)
    .join("")

  const html = `<${tag}>${lightDomContent}
  <template shadowrootmode="open">
${shadowDom
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  </template>
</${tag}>`

  return {
    tag,
    shadowDom,
    lightDom: slots,
    html,
  }
}

export function renderDeclarativeShadowDom(
  tag: string,
  shadowDom: string,
  lightDom: string = ""
): string {
  return `<${tag}>${lightDom}
  <template shadowrootmode="open">
${shadowDom
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  </template>
</${tag}>`
}
