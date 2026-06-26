# JustJS — Runbook

Day-to-day commands for working in this repository.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| bun | >= 1.0 | Package manager + script runner |
| Node.js | >= 20 | TypeScript compilation (tsc) |
| git | any | Source control |

---

## Setup

```bash
git clone <repo>
cd justjs
bun install
```

---

## Build

Packages have a strict build order — `@justjs/browser` imports type declarations
from `@justjs/core/dist`, so core must be built first.

```bash
# Build all packages in dependency order
bun run --filter '@justjs/core' build
bun run --filter '@justjs/browser' build

# Or build everything (order not guaranteed — use with care)
bun run build
```

Output lands in each package's `dist/` directory.

---

## Typecheck

```bash
# All packages
bun run typecheck

# Single package
bun run --filter '@justjs/core' typecheck
bun run --filter '@justjs/browser' typecheck
```

Both must exit `0` before any commit that touches `src/`.

---

## Test

> **Status:** test infrastructure is not yet set up.
> `@justjs/core` references jest in its test script but jest is not installed.
> Tracked in issue #2 (core implementations) — tests will be added alongside each implementation.

```bash
# Will run once tests are wired up
bun run test
```

---

## Clean build artifacts

```bash
# Remove dist/ from all packages
rm -rf packages/*/dist
```

---

## Add a dependency

```bash
# Dev dependency to a specific package
bun add -d <pkg> --cwd packages/core

# Runtime dependency
bun add <pkg> --cwd packages/browser
```

`@justjs/core` must remain at zero runtime dependencies — never add a runtime
dep there.

---

## Verify the workspace

After any structural change (new package, changed exports):

```bash
bun install          # re-resolve workspace links
bun run --filter '@justjs/core' build
bun run typecheck    # both packages must pass
```

---

## Common errors

### `Cannot find module '@justjs/core'`

`@justjs/browser` can't find core's type declarations. Build core first:

```bash
bun run --filter '@justjs/core' build
```

### `BootError: UNKNOWN_ROUTE`

An aspect's `on` or `except` array references a route path not present in
`routes.gen.json`. Check the path spelling — the error includes a "Did you
mean?" suggestion when the edit distance is ≤ 3.

### `BootError: UNKNOWN_COMPONENT`

Same as above but for a component tag name not present in `registry.gen.ts`.

### `BootError: UNKNOWN_STRATEGY`

An aspect's `strategy` name has no registered provider in the `AspectRegistry`.
Ensure the provider package is imported and self-registers before `JustJS.boot()`
is called.
