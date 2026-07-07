# POC: Semver Contract — JustJS ↔ Build Tools

Defines the stable artifact shapes and compatibility guarantees between justweb (generator) and JustJS build tools (consumer).

**Status:** POC — v0.6 (byte-confirmed against a real `justw generate app` run, including justweb#56 and #52's landed fixes — see justjs#38/#39/#41/#49 and justweb ADR-0006/ADR-0008/#52/#56)

> **Correction note (v0.3):** v0.2's shapes for artifacts #1–#4 below were written ahead of any real integration and turned out to not match what justweb actually generates, or ever planned to generate. Filed as justjs#38/#39/#41 (RFC) after running `justw init` → `justw generate app` end-to-end and inspecting real output. Resolved on justweb's side via ADR-0006 (routing) and ADR-0008 (registry shape); v0.3 brought the shapes below in line with those decisions.
>
> **Correction note (v0.4):** actually generated a real project (`justw init`/`justw generate app`) and diffed every artifact against v0.3's descriptions field-for-field, closing the "cited from an ADR, not byte-inspected" caveats v0.3 carried. Confirmed a real, previously-undiscovered gap in the process: `routes.gen.json` and `dom-address-map.json` both key by the *bare* component name (`"home"`), not the actually-registered custom-element tag (`"js-home"`) — filed upstream as justweb#56 (justjs#49 tracks the consumer-side impact). Everything else matched exactly.
>
> **Correction note (v0.5):** justweb#56 landed — `dom-address-map.json`'s element descriptors now carry a `tag` field (the actually-registered custom-element tag) alongside the unchanged `component` field. `@justjs/application`'s `MountStep`/`BootValidator` updated to resolve by `tag`, not `component`. **`routes.gen.json` was not part of this fix** — it still only carried the bare `component` field, confirmed by regenerating after the fix landed. That part of justweb#56 remained open.
>
> **Correction note (v0.6):** justweb#56's `routes.gen.json` half landed too (`routes.gen.json` route entries now also carry `tag`) — justweb#56 is now fully resolved, both artifacts. Separately, justweb#52 landed real `props:` → attribute-backed signal codegen (`observedAttributes` + `attributeChangedCallback`), closing the "`props:` has no codegen, `setAttribute` is inert" gap ADR-0006 rev.4 and ADR-0008 both noted. `adaptCustomElementRegistry` (justjs#46) updated to take advantage: it now reuses an already-mounted element across repeated `render()` calls instead of always reconstructing, since `setAttribute` on an already-connected element is real again for declared props. Also found and filed upstream while verifying #52: a `props:`/`states:` name colliding with a `dom.elements`/`dom.slots` name produces a class with duplicate TS members that fails to compile (justweb#57) — confirmed via an isolated repro, not just inspection.

---

## Artifacts

Build tools must respect these four artifacts from justweb. Each has a stable schema and semver guarantees.

### 1. routes.gen.json

**Corrected (v0.3):** v0.2 assumed justweb already emitted this file as a flat `{routes: string[]}` list. It didn't — `justw generate --help`'s own "PER-APP OUTPUTS" list never mentioned it, and a real `generate app` run confirmed nothing was written (justjs#39). Resolved via justweb ADR-0006: a new project-level `routes.yaml` (sibling to `justweb.toml`, not per-component) is compiled into `routes.gen.json` plus generated browser wiring code (`routes.gen.ts` — vanilla History API, no framework dependency). justweb owns this **structurally** (which path renders which feature/component, nesting, dynamic segments) — never **behaviorally** (auth, data loading, transitions stay opaque pass-through).

**Purpose:** Resolved route → feature/component mapping, generated from `routes.yaml`.

**Source shape (`routes.yaml`, hand-authored):**
```yaml
routes:
  - path: /
    feature: home
    component: home
    targets: [browser, native, desktop]

  - path: /checkout
    feature: checkout
    component: checkout
    guard: authRequired      # opaque tag — justweb never interprets this

  - path: /account
    feature: account
    component: account
    children:
      - path: profile         # resolves to /account/profile
        feature: account
        component: profile

  - path: /order/:id           # dynamic segment
    feature: order
    component: order-detail
    params:
      id: id                  # :id segment → order-detail's own declared `id` prop
```

**Generated shape (byte-confirmed, v0.6 — regenerated after justweb#56 fully landed):**
```json
{
  "routes": [
    { "component": "home", "feature": "home", "path": "/", "tag": "js-home", "targets": ["browser"] }
  ],
  "version": 1
}
```
A flat `{routes: [...], version}` object — `component`/`feature` cross-references, `guard`/`params` present per-route only when declared in `routes.yaml`. **Resolved (v0.6):** `component` is still the bare `*_component.yaml` name (`"home"`); `tag` (justweb#56, landed after the `dom-address-map.json` half) is the actually-registered custom-element tag (`"js-home"`) — resolve against `tag`, matching artifact #4 below.

**Key behaviors, not just shape:**
- `feature`/`component`/`targets` are validated cross-references against the discovered `*_component.yaml`/`*_api.yaml` set — an unresolved reference is a validation error, not a silent no-op.
- `:name` dynamic segments are validated for syntax and per-path uniqueness; `params:` mapping is validated (prop exists, type is `string`/`enum`).
- Generated wiring code fully remounts the target component on any dynamic-segment value change rather than updating an existing instance's attribute in place — this predates justweb#52's `props:` signal codegen (ADR-0006 rev.4) and hasn't been revisited since #52 landed; may be loosenable now, not yet confirmed.
- `guard` and any similar per-route field are never enforced or interpreted by justweb — that's the consumer's responsibility.

**Semver guarantees:**
- ✅ **Minor bump:** New routes added (always backwards-compatible)
- ❌ **Never breaking:** Route paths never removed, only extended
- ❌ **Never breaking:** Route path strings never change

**Consumer validation:**
- JustJS.boot() checks every route in `.on([])` / `.except([])` exists in `routes.gen.json`
- Missing route → `BootError` with helpful suggestion

---

### 2. registry.gen.ts + component-registry.gen.ts

**Corrected (v0.3):** v0.2 described a single `registry.gen.ts` typed as `import type { ComponentRegistry } from "@justjs/application"` — a real coupling-boundary violation (justweb's generated output must never reference a consumer's package by name or type, per ADR-0004/ADR-0005/ADR-0007) *and* not what justweb actually emits. Real output (justjs#39) is a side-effect-only script calling `customElements.define(tag, Klass)` at load time — no exported map at all. Resolved via justweb ADR-0008: a **second, separate** generated file, `component-registry.gen.ts`, additionally exports a generic lazy map. The two files are kept separate on purpose — colocating them would make the map's laziness fake, since ES modules execute their whole body on import regardless of which export is used.

**`registry.gen.ts` (unchanged, side-effect script):**
```typescript
// registry.gen.ts — DO NOT EDIT — generated by: justw generate app
import { HomeBase } from "./features/home/home_component.gen.js"
import { CheckoutBase } from "./features/checkout/checkout_component.gen.js"

customElements.define("js-home", HomeBase)
customElements.define("js-checkout", CheckoutBase)
```
Import this file for its side effect and every component is eagerly registered. No exported map, no `@justjs/*` reference anywhere.

**`component-registry.gen.ts` (new, generic + lazy):**
```typescript
// component-registry.gen.ts — DO NOT EDIT — generated by: justw generate app

export const COMPONENT_REGISTRY: Record<string, () => Promise<CustomElementConstructor>> = {
  'js-home': () => import('./features/home/home_component.gen').then(m => m.HomeBase),
  'js-checkout': () => import('./features/checkout/checkout_component.gen').then(m => m.CheckoutBase),
};
```
`CustomElementConstructor` is the standard TypeScript DOM-lib type (`lib.dom.d.ts`), not a justjs type — nothing in this file references `@justjs/*`. Consuming this map costs nothing until a specific entry is called; justweb's own `routes.gen.ts` (ADR-0006) is the first real consumer, using it for genuine per-route code-splitting.

**`@justjs/application` side:** `DefaultComponentRegistry`'s own shape — lazy `(props?) => Component` factories via `.register(tag, factory)`, enforcing hyphenated tags — is a third, independent shape again. Bridging `COMPONENT_REGISTRY` to it is `@justjs/application`'s own adapter to write (ADR-0008 is explicit this isn't justweb's decision); see `adaptCustomElementRegistry` in `application/scm/main/src/core/registry/component_registry_adapter.ts` (justjs#46).

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

**Correction (v0.3):** confirmed unimplemented on justweb's side, and not part of ADR-0006's scope either — `justw generate --help` does not list this file, and no real `generate app` run produces it (justjs#39, justweb#49). The shape below remains aspirational/undecided, not a live contract. Do not build consumer code against this artifact existing today.

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

**Corrected (v0.3):** v0.2 described this as CSS-selector lists keyed by tag (`{"x-button": ["button", ...]}`). That was wrong — confirmed by generating a real project via `justw generate app` and inspecting the actual output (justjs#38's correction comment). No CSS selectors appear anywhere in real output.

**Purpose:** Valid DOM addresses (DDAS) for component lifecycle hooks.

**Shape (byte-confirmed, v0.5 — generated from `justw init test-app --features home` → `justw generate app`, after justweb#56 landed):**
```json
{
  "app": "test-app",
  "elements": {
    "test-app:home:home:button": {
      "component": "home",
      "feature": "home",
      "interactive": true,
      "scope": "public",
      "tag": "js-home",
      "type": "button"
    }
  },
  "schema": "1",
  "version": "0.1.0"
}
```

A flat map keyed by colon-delimited hierarchical address strings (`app:feature:component:part`), not by component tag. Each entry carries metadata about the element it addresses.

**Resolved (v0.5):** `component` is still the *bare* `*_component.yaml` name (`"home"`) — it does **not** cross-reference the actually-registered custom-element tag. justweb#56 added a new `tag` field (`"js-home"` here) alongside the unchanged `component`, computed via the same internal `js-` prefix convention (`domcompiler::TAG_PREFIX`) `component-registry.gen.ts`/`registry.gen.ts` already use. **Resolve DDAS entries by `tag`, not `component`** — `@justjs/application`'s `MountStep`/`BootValidator` do this now (justjs#45/#49). `tag` is optional in `application`'s type since older justweb output predating justweb#56 won't have it.

**Schema (`application`'s `DomAddressMap`, `application/scm/main/src/api/dom-address.ts`):**
```typescript
interface DomAddressElement {
  readonly component: string
  readonly tag?: string  // justweb#56 — resolve against this, not `component`
  readonly feature?: string
  readonly interactive?: boolean
  readonly scope?: string
  readonly type?: string
}

interface DomAddressMap {
  readonly app?: string
  readonly elements: Record<string, DomAddressElement>
  readonly schema?: string
  readonly version?: string
}
```

**Consumer resolution:** `@justjs/application`'s `MountStep` (`lifecycle_pipeline.ts`) resolves a component tag's DDAS entries by scanning `elements` for entries whose `tag` field matches, not via a direct keyed lookup and not via `component` (justjs#45/#49).

**Semver guarantees:**
- ✅ **Minor bump:** New addresses added per component (always backwards-compatible)
- ❌ **Never breaking:** Address entries never removed, only extended
- ✅ **Patch OK:** Metadata fields may gain new optional keys (e.g. `tag`, justweb#56)

**Consumer validation:**
- JustJS.boot() checks every component tag in `.on([])` / `.except([])` has at least one DDAS entry (an `elements` value whose `tag` matches)
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
- ⚠️ Generates artifacts #1, #2, #4 today; #3 (`importmap.gen.json`) remains unimplemented/undecided (v0.3 correction)
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
