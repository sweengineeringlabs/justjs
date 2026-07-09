# @justjs/vite

Config codegen + HMR for JustJS applications.

Reads `justjs.config.toml` and generates `core/app.ts` with strategy imports and `JustJS.boot()` call.

## Usage

```bash
bun run dev
```

Watches for changes to `justjs.config.toml` and regenerates `core/app.ts`.

## Config Example

`on`/`except` are split into `_routes`/`_components` variants (justjs#60) —
a flat list is ambiguous about whether its entries are route paths or
component tags, so there's no single `on`/`except` key:

```toml
# justjs.config.toml
[security]
strategy = "oauth"
on_routes = ["/dashboard", "/account"]
on_components = ["x-user-menu"]
except_routes = ["/login"]

[observability]
strategy = "datadog"
all = true
```

Generated output nests every concern under a single `aspects` object,
matching `@justjs/application`'s `BootConfig.aspects: Record<string,
AspectConfig>` exactly — `BootValidator`/`boot()`'s resolve-and-weave loop
only ever reads aspect declarations from this nested shape, never from
top-level `security`/`observability`/etc. keys:

```typescript
// core/app.ts (generated, do not edit)
import "@justjs/aop-security-oauth"
import "@justjs/aop-observability-datadog"

JustJS.boot({
  routes, importmap, registry, domMap,
  aspects: {
    security: {
      strategy: "oauth",
      routes: { on: ["/dashboard", "/account"], except: ["/login"] },
      components: { on: ["x-user-menu"] },
    },
    observability: { strategy: "datadog" },
  },
})
```

## Stability

Uses artifacts from the **Contract Spec** (see `docs/POC-CONTRACT-SPEC.md`):
- `routes.gen.json` — validates routes exist
- `registry.gen.ts` — validates component tags exist
- `importmap.gen.json` — reads available strategy imports
