# @justjs/vite

Config codegen + HMR for JustJS applications.

Reads `justjs.config.toml` and generates `src/core/app.gen.ts` with strategy imports and `JustJS.boot()` call.

## Usage

The project must pin `mweb` 0.5.0 and provide its clean generated manifest.
Install and generate the artifacts before Vite code generation:

```bash
justjs toolchain install
justjs generate
justjs check
bun run codegen
bun run dev
```

Watches for changes to `justjs.config.toml` and regenerates `src/core/app.gen.ts`.

## Config Example

`on`/`except` are split into `_routes`/`_components` variants (justjs#60) —
a flat list is ambiguous about whether its entries are route paths or
component tags, so there's no single `on`/`except` key:

```toml
# justjs.config.toml
[justweb]
generator_version = "0.5.0"
generator_revision = "9035afa17bca513bcfd3e3081ae0fcba26df902e"
artifact_schema = 1
artifact_manifest = "public/justweb-artifacts.gen.json"

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
// src/core/app.gen.ts (generated, do not edit)
import { justjs } from "@justjs/application"
import "@justjs/aop-security-oauth"
import "@justjs/aop-observability-datadog"

// The generated boot helper embeds the verified contract and manifest.
await justjs.boot({
  routes, registry, domAddressMap,
  justwebContract: JUSTWEB_CONTRACT,
  justwebManifest: JUSTWEB_MANIFEST,
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

Uses artifacts from the [contract spec](../../../../docs/POC-CONTRACT-SPEC.md):
- `routes.gen.json` — validates routes exist
- `registry.gen.ts` — validates component tags exist
- `importmap.gen.json` — reads available strategy imports
- `public/justweb-artifacts.gen.json` — verifies the generator identity and every artifact SHA-256
