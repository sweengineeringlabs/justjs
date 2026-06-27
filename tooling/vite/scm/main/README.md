# @justjs/vite

Config codegen + HMR for JustJS applications.

Reads `justjs.config.toml` and generates `core/app.ts` with strategy imports and `JustJS.boot()` call.

## Usage

```bash
bun run dev
```

Watches for changes to `justjs.config.toml` and regenerates `core/app.ts`.

## Config Example

```toml
# justjs.config.toml
[security]
strategy = "oauth"
on = ["/dashboard", "/account"]

[observability]
strategy = "datadog"
all = true
```

Generated output:

```typescript
// core/app.ts (generated, do not edit)
import "@justjs/aop-security-oauth"
import "@justjs/aop-observability-datadog"

JustJS.boot({
  routes, importmap, registry, domMap,
  security: { strategy: "oauth", on: ["/dashboard", "/account"] },
  observability: { strategy: "datadog", all: true },
})
```

## Stability

Uses artifacts from the **Contract Spec** (see `docs/POC-CONTRACT-SPEC.md`):
- `routes.gen.json` — validates routes exist
- `registry.gen.ts` — validates component tags exist
- `importmap.gen.json` — reads available strategy imports
