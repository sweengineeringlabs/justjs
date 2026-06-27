# POC: Semver Contract — JustJS ↔ Build Tools

Defines the stable artifact shapes and compatibility guarantees between justweb (generator) and JustJS build tools (consumer).

**Status:** POC — v0.2 (foundation for all build-time tooling)

---

## Artifacts

Build tools must respect these four artifacts from justweb. Each has a stable schema and semver guarantees.

### 1. routes.gen.json

**Purpose:** Authoritative list of valid route paths in the application.

**Shape:**
```json
{
  "routes": [
    "/",
    "/checkout",
    "/account",
    "/account/profile",
    "/account/settings",
    "/dashboard"
  ]
}
```

**Schema:**
```typescript
interface RoutesArtifact {
  readonly routes: readonly string[]
}
```

**Semver guarantees:**
- ✅ **Minor bump:** New routes added (always backwards-compatible)
- ❌ **Never breaking:** Route paths never removed, only extended
- ❌ **Never breaking:** Route path strings never change

**Consumer validation:**
- JustJS.boot() checks every route in `.on([])` / `.except([])` exists in `routes.gen.json`
- Missing route → `BootError` with helpful suggestion

---

### 2. registry.gen.ts

**Purpose:** Authoritative list of registered Web Component tags and their implementations.

**Shape:**
```typescript
// registry.gen.ts
import type { ComponentRegistry } from "@justjs/application"

export const COMPONENT_REGISTRY: ComponentRegistry = {
  "x-button": () => import("./button_component.gen.js").then(m => m.XButton),
  "x-card": () => import("./card_component.gen.js").then(m => m.XCard),
  "x-modal": () => import("./modal_component.gen.js").then(m => m.XModal),
}
```

**Schema:**
```typescript
type ComponentRegistry = Record<
  string,  // kebab-case tag name
  () => Promise<CustomElementConstructor>
>
```

**Semver guarantees:**
- ✅ **Minor bump:** New components added (always backwards-compatible)
- ❌ **Never breaking:** Component tags never removed, only extended
- ❌ **Never breaking:** Tag names never change
- ❌ **Never breaking:** Import paths may change, but module exports same constructor

**Consumer validation:**
- JustJS.boot() checks every component tag in `.on([])` / `.except([])` exists in registry
- Missing tag → `BootError` with suggestion

---

### 3. importmap.gen.json

**Purpose:** ES module import map for dependency resolution in the browser.

**Shape:**
```json
{
  "imports": {
    "@justjs/aop-security-oauth": "/vendor/security-oauth-abc123.js",
    "@justjs/aop-observability-datadog": "/vendor/observability-datadog-def456.js",
    "@justjs/aop-flags-launchdarkly": "/vendor/flags-launchdarkly-ghi789.js",
    "@justjs/core": "/vendor/core-jkl012.js"
  }
}
```

**Schema:**
```typescript
interface ImportMap {
  readonly imports: Record<string, string>
}
```

**Semver guarantees:**
- ✅ **Minor bump:** New imports added (always backwards-compatible)
- ❌ **Never breaking:** Import specifiers never removed, only extended
- ✅ **Patch OK:** URLs may change (e.g., cache-busting hash updates)
- ✅ **Patch OK:** New imports added for new dependencies

**Consumer validation:**
- Build tools verify importmap.gen.json is valid JSON
- Build tools inline importmap into `<script type="importmap">` in production HTML

---

### 4. dom-address-map.json

**Purpose:** Valid DOM addresses (DDAS) for component lifecycle hooks.

**Shape:**
```json
{
  "addresses": {
    "x-button": ["button", "button[data-action]"],
    "x-card": ["div.card", "article.card-wrapper"],
    "x-modal": ["dialog", "div[role=dialog]"]
  }
}
```

**Schema:**
```typescript
interface DomAddressMap {
  readonly addresses: Record<string, readonly string[]>  // CSS selectors
}
```

**Semver guarantees:**
- ✅ **Minor bump:** New addresses added per component (always backwards-compatible)
- ❌ **Never breaking:** Selectors never removed, only extended
- ✅ **Patch OK:** Selector strings may be optimized (semantically equivalent)

**Consumer validation:**
- JustJS.boot() checks every component tag in `.on([])` / `.except([])` has valid DDAS entries
- Missing DDAS entry → `BootError`

---

## Versioning Rules

**JustJS maintains forward compatibility** with all tool-generated artifacts. When tool versions bump:

| Tool version | JustJS compatibility | Action |
|---|---|---|
| No change | ✅ Always works | Consume latest artifact |
| Minor bump | ✅ Always works | Consume latest artifact (additive only) |
| Major bump | ⚠️ May require update | Check breaking changes in release notes |

**Build tools maintain backwards compatibility** with JustJS. When JustJS versions bump:

| JustJS version | Tool compatibility | Tool action |
|---|---|---|
| No change | ✅ Always works | No action |
| Minor bump | ✅ Always works | No action (JustJS is additive) |
| Major bump | ⚠️ Check notes | Read migration guide |

---

## Validation Rules (Boot-time)

`JustJS.boot()` runs `BootValidator` before any layer initialises. All checks must pass:

1. **Providers exist** — Every strategy name is registered in `JustJS.providers`
2. **Routes exist** — Every route in `.on([])` / `.except([])` exists in `routes.gen.json`
3. **Components exist** — Every component tag in `.on([])` / `.except([])` exists in `registry.gen.ts`
4. **DDAS valid** — Every component tag in `.on([])` / `.except([])` has DDAS entry in `dom-address-map.json`

**Failure example:**
```
BootError: route "/cheackout" not found in routes.gen.json
           Known routes: /home, /checkout, /dashboard, /account
           Did you mean "/checkout"?
```

---

## Tool Responsibilities

### justweb (generator)
- ✅ Generates all four artifacts
- ✅ Maintains semver guarantees
- ✅ Verifies artifact schemas on generation
- ✅ Documents breaking changes in release notes

### Build tools (consumer)
- ✅ Read and consume artifacts
- ✅ Respect semver guarantees (never assume unstable schema)
- ✅ Validate artifact presence (fail early if missing)
- ✅ Inline/embed artifacts in build output where appropriate

### JustJS (validator)
- ✅ Boot-time validation of all artifact entries
- ✅ Helpful error messages (typo suggestions, list of valid values)
- ✅ Never assume artifact stability beyond documented guarantees

---

## POC Acceptance Criteria

- [ ] All four artifact shapes documented with schemas
- [ ] Semver rules defined and justified (why never-breaking on removals)
- [ ] Validation rules documented with examples
- [ ] Tool responsibilities clarified
- [ ] Example artifacts created for each type
- [ ] Spec stored in `docs/POC-CONTRACT-SPEC.md`

---

## Next Steps

Once this spec is locked:
1. Config codegen tool (#11) implements `routes` + `registry` consumption
2. SSR tool (#12) consumes `registry`
3. Build pipeline tool (#13) consumes `importmap`
4. Boot validator (#ADR) cross-validates all four

---

**Related issues:** #11, #12, #13, #14, Epic #35
