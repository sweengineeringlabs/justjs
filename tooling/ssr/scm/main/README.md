# @justjs/ssr

Server-side component rendering with Declarative Shadow DOM for JustJS.

Renders custom element components to HTML strings for SSR. No browser APIs required.

## Usage

```typescript
import { renderComponent } from "@justjs/ssr"

const html = renderComponent("x-button", {
  label: "Click me",
})

console.log(html)
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
- ✅ Hydrates seamlessly in browser
- ✅ Works without Custom Elements API (server-side only)

## Stability

Uses artifacts from the **Contract Spec** (see `docs/POC-CONTRACT-SPEC.md`):
- `registry.gen.ts` — validates component tags exist
- `dom-address-map.json` — provides DDAS selectors for testing
