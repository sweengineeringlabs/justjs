# JustJS — Playbook

Engineering guides for common scenarios.

---

## Implement a new aspect strategy

Aspects are the primary extension point. A strategy is a named implementation
of a cross-cutting concern (security, i18n, analytics, etc.).

**1. Create the provider package (or add to an existing one)**

```
packages/
  browser/
    src/
      spi/
        security/
          bearer_token_guard.ts   ← new strategy implementation
```

**2. Implement `AspectProvider` and `JustJSAspect`**

```typescript
import type { AspectProvider, JustJSAspect, AspectTarget } from "@justjs/core"

const BearerTokenAspect: JustJSAspect = {
  concern:  "security",
  strategy: "bearer-token",
  weave(target: AspectTarget): void {
    // intercept requests/routes matching target and attach the bearer token
  }
}

export const BearerTokenProvider: AspectProvider = {
  concern:  "security",
  strategy: "bearer-token",
  factory() { return BearerTokenAspect }
}
```

**3. Self-register before `JustJS.boot()`**

```typescript
// In the provider package's entry point or in the app's app.ts
import { aspectRegistry } from "@justjs/browser"
import { BearerTokenProvider } from "./spi/security/bearer_token_guard.js"

aspectRegistry.register(BearerTokenProvider)

JustJS.boot({
  aspects: {
    security: { strategy: "bearer-token", routes: { on: ["/dashboard"] } },
  },
  // ...
})
```

**4. Declare in boot config by strategy name — never by import**

Every aspect is declared under a single nested `aspects` map — `BootConfig`
has no top-level `security`/`observability`/etc. fields (justjs#54, and see
justjs#60 for what happens when a config-generating layer forgets this):

```typescript
aspects: {
  security: { strategy: "bearer-token", routes: { on: ["/dashboard"] } },
}
```

**Checklist:**
- [ ] `concern` and `strategy` match exactly between provider and boot config
- [ ] Provider registered before `JustJS.boot()` is called
- [ ] Strategy name validated at boot — `UNKNOWN_STRATEGY` BootError if not registered

---

## Implement a lifecycle step

The lifecycle pipeline (issue #3) runs: ResolveStep → MountStep → RenderStep →
UpdateStep → UnmountStep. Each step implements `LifecycleStep`.

```typescript
import type { LifecycleStep, ComponentContext } from "@justjs/core"

export const ResolveStep: LifecycleStep = {
  name() { return "resolve" },

  async execute(ctx: ComponentContext): Promise<void> {
    const data = await ctx.api.get(ctx.component.id())
    await ctx.store.dispatch({ type: "RESOLVED", payload: data })
  }
}
```

**Rules:**
- Each step must be independently testable — it receives the full `ComponentContext`
- Steps must not hold state — all state lives in `ctx.store`
- A failing step emits the corresponding `*_failed` `LifecycleEvent` via `ctx.observer`

---

## Add a new interface to `@justjs/core`

`@justjs/core` is the contract layer — interfaces only, zero runtime dependencies.

**Checklist:**
- [ ] Create `packages/core/src/api/<name>.ts` — interfaces and types only
- [ ] No imports from outside `@justjs/core/src/api/` (no runtime deps)
- [ ] Export from `packages/core/src/saf/index.ts`
- [ ] If the interface belongs in `ComponentContext`, add it to `component.ts` with a forward-reference import
- [ ] Run `bun run --filter '@justjs/core' build` and `bun run typecheck` — both must pass

---

## Implement a platform adapter

When `justweb#43` unblocks native/mobile/desktop, each adapter package implements
the same `@justjs/core` contracts against its platform's APIs.

**Contracts to implement per adapter:**

| Interface | Where |
|---|---|
| `RuntimeAdapter` | `mount`, `unmount`, `render` against the platform UI |
| `ApiAdapter` | `get`, `mutate`, `upload` using platform HTTP client |
| `WsAdapter` | `connect` using platform WebSocket |
| `CacheAdapter` | `get`, `set`, `invalidate` using platform storage |

**Pattern:**

```
packages/
  native/
    src/
      api/     ← re-export or extend @justjs/core contracts if needed
      core/    ← platform-specific implementations
      saf/     ← sole public export surface
      spi/     ← platform-specific aspect providers
```

The adapter package depends on `@justjs/core` only. It must not depend on
`@justjs/browser`.

---

## Debug a BootError

`JustJS.boot()` throws a `BootError` before any layer starts. The error carries
structured fields even though they are non-enumerable — access them directly:

```typescript
try {
  JustJS.boot(config)
} catch (e) {
  if (typeof e === "object" && e !== null && "code" in e) {
    const err = e as BootError
    console.error(err.code)      // UNKNOWN_ROUTE | UNKNOWN_COMPONENT | UNKNOWN_STRATEGY
    console.error(err.received)  // the value that was not found
    console.error(err.known)     // full list of known values
    console.error(err.nearest)   // closest match, if within edit distance 3
  }
}
```

> Note: `JSON.stringify(err)` produces `{}` — the fields are non-enumerable.
> Access them by name, not via spread or serialisation.

**Triage by code:**

| Code | Cause | Fix |
|---|---|---|
| `UNKNOWN_ROUTE` | Path in `on`/`except` not in `routes.gen.json` | Regenerate routes or fix the path spelling |
| `UNKNOWN_COMPONENT` | Tag name in `on`/`except` not in `registry.gen.ts` | Regenerate registry or fix the tag name |
| `UNKNOWN_STRATEGY` | Strategy name has no registered provider | Import and register the provider before `boot()` |

---

## Re-pin the toolchain

Use this when a new `justw` (or `csslense`, `browsectl`) release should be what the examples
and CI use. The pins live in four places that must agree: each example's `justjs.config.toml`,
the `justweb` checkout `ref:` in `.github/workflows/ci.yml`, the docs, and (for the CLI) the
`justweb-dev` checkout `ref:`. `bun run check:docs` fails if they drift.

### Order across repositories

1. **Release the tool** from its own repository (`justweb` for `justw`), following that
   repository's release playbook. A release is only usable if it carries every platform you need.
2. **Re-pin and release the CLI** in `justweb-dev` if its bundled pin should change.
3. **Then re-pin here.** Never pin a version or commit that is not yet a published release or
   on `main`.

### Steps

1. **Read the release's identity.** The version is the tag; the revision is the commit the
   binary was built from:

   ```sh
   gh release download vX.Y.Z -R sweengineeringlabs/justweb -p toolchain-manifest.json -O -
   ```

2. **Pin it in every example that uses the generator** (`hello-justjs`, `cross-target-demo`,
   `agentic-memory-demo`, `ai-code-editor`) by editing the two lines under `[justweb]` in its
   `justjs.config.toml`:

   ```toml
   generator_version = "X.Y.Z"
   generator_revision = "<40-character revision>"
   ```

   Edit by hand rather than with `justjs toolchain pin`: `pin` validates and rewrites the whole
   file, which drops the examples' explanatory comments and re-sorts their sections (seen on
   `hello-justjs`), turning a two-line change into a large diff. `pin` is fine for a project
   whose config has no comments. Either way the CLI validates the pin the next time it runs.
3. **Install and regenerate.** CI regenerates every example and fails on any difference, so do
   the same and commit what changes:

   ```sh
   justjs toolchain install
   for app in hello-justjs cross-target-demo agentic-memory-demo ai-code-editor; do
     (cd scm/examples/$app && justjs generate)
   done
   git status --short scm/examples
   ```

4. **Update CI.** In `.github/workflows/ci.yml` set the `sweengineeringlabs/justweb` checkout
   `ref:` to the same 40-character revision (the check requires it to equal the examples' pin).
   If the CLI changed, set the `sweengineeringlabs/justweb-dev` `ref:` to a commit on its `main`.
5. **Update the docs.** The pin table under "Pinned toolchain" in the
   [architecture](../3-design/architecture.md#pinned-toolchain), and a dated addendum in
   `docs/e2e-validation.md` recording what you verified.
6. **Check consistency:** `bun run check:docs`. It names every file that still says the old
   version, revision or ref.
7. **Verify.** `bun run check:cli-examples` runs the complete example workflows locally (it
   needs the CLI on `PATH`, a browser, and a token for private downloads); CI runs the same on
   Linux and Windows. Open the pull request and wait for CI.

The failures you are most likely to meet are in the
[runbook](runbook.md#pinned-toolchain-failures).
