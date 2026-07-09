# @justjs/ssr

Server-side component rendering with Declarative Shadow DOM for JustJS.

Renders the *real* custom element class — the same one `@justjs/application`'s
`adaptCustomElementRegistry` constructs client-side — to an HTML string,
instead of a hand-written parallel template that could drift out of sync
(ADR-0005, `docs/adr/ADR-0005-ssr-reconciliation.md`).

Requires a DOM implementation (`document`/`HTMLElement`/`customElements`)
already registered as a global before calling `renderComponent()` — this
package does not register one itself. A real SSR process registers one once
at startup (e.g. `@happy-dom/global-registrator`); this package's own tests
do the same, once per test file.

## Usage

```typescript
import { renderComponent } from "@justjs/ssr"
import type { LazyCustomElementRegistry } from "@justjs/application"

// The same lazy loader shape justweb's generated component-registry.gen.ts
// produces, and the same one @justjs/application's adaptCustomElementRegistry
// consumes client-side.
const loadButton: LazyCustomElementRegistry[string] = async () => {
  const { XButton } = await import("./x-button.js")
  return XButton
}

const rendered = await renderComponent("x-button", loadButton, {
  label: "Click me",
})

console.log(rendered.html)
// <x-button>
//   <template shadowrootmode="open">
//     <button>Click me</button>
//   </template>
// </x-button>
```

## Declarative Shadow DOM

Output uses [Declarative Shadow DOM](https://developer.chrome.com/articles/declarative-shadow-dom/) format:

```html
<custom-element>
  <template shadowrootmode="open">
    <!-- shadow tree content -->
  </template>
  <!-- light DOM slots -->
</custom-element>
```

This format:
- ✅ Renders instantly (no JavaScript required for initial paint)
- ✅ Hydrates seamlessly in a real browser — `@justjs/application`'s `adaptCustomElementRegistry` already reuses a pre-upgraded custom element instance instead of reconstructing it (ADR-0005)
- ⚠️ Server-side rendering itself does require a DOM implementation (see Usage above) — the *output* is what needs no client JavaScript for initial paint, not the rendering process that produces it

## Stability

Uses artifacts from the **Contract Spec** (see `docs/POC-CONTRACT-SPEC.md`):
- `registry.gen.ts` — validates component tags exist
- `dom-address-map.json` — provides DDAS selectors for testing
