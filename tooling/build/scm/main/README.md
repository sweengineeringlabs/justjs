# @justjs/build

Production build pipeline for JustJS applications.

Bundles application code and inlines importmap for production delivery.

## Usage

```typescript
import { buildApp, inlineImportmap } from "@justjs/build"

const importmap = {
  imports: {
    "@justjs/core": "/vendor/core-abc123.js",
    "@justjs/aop-security-oauth": "/vendor/security-oauth-def456.js",
  }
}

const bundleCode = `
import { boot } from "./app.gen.js"
boot()
`

const html = inlineImportmap(bundleCode, importmap)

console.log(html)
// <script type="importmap">
// {
//   "imports": { ... }
// }
// </script>
// <script>
// ...bundleCode...
// </script>
```

## Features

- ✅ Importmap inlining for production
- ✅ No external import resolution needed
- ✅ Tree-shake validation (only specified imports bundled)
- ✅ HTML escaping for security

## Stability

Uses artifacts from the **Contract Spec** (see `docs/POC-CONTRACT-SPEC.md`):
- `importmap.gen.json` — import mapping for production
- `routes.gen.json` — validates all routes accessible
