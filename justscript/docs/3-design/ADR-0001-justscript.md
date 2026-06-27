# ADR-0001: JustScript

- **Status:** Active
- **Date:** 2026-06-27

## Summary

JustScript ports the Rust principles that translate cleanly to TypeScript — type-safe
error handling, explicit optionality, opaque domain types, exhaustive matching, and
deterministic resource cleanup. It is a foundational library consumed by JustJS and
any other TypeScript project in the ecosystem.

It lives as a workspace inside `justjs/` temporarily. It will move to its own repo
(`swelabs/justscript`) once the contracts stabilise.

---

## Name

`JustScript` signals the intent: Rust principles, JavaScript runtime. The risk is
confusion with Rust-to-WASM tooling or Rust bindings for JS. The README must state
scope on day one — this library ports ~5 Rust concepts, not the language.

---

## What we port — and what we don't

### Ported

| Concept | Why |
|---|---|
| `Result<T, E>` | Eliminates silent throws. Every fallible operation has an explicit error path the caller must handle. |
| `Option<T>` | Eliminates `null` / `undefined` at API boundaries. Callers cannot ignore absence. |
| Newtype / branded types | Prevents mixing domain primitives. `FeatureId` and `RouteId` are both `string` at runtime but incompatible at compile time. |
| Exhaustive `match` | Forces callers to handle every union arm. The compiler rejects unhandled cases. |
| `Drop` / deterministic cleanup | `Symbol.dispose` (TS 5.2+, the `using` keyword) maps directly to Rust's `Drop` trait. Resources are released at scope exit. |
| Move semantics / one-shot consumers | Modelled with type-state patterns. A consumed handle becomes a different type — the compiler prevents reuse. |

### Not ported

| Concept | Why not |
|---|---|
| Memory ownership | The GC handles deallocation. Nothing to port. |
| Borrow checker / aliasing rules | TypeScript's type system cannot express aliasing. Any attempt would cost more in complexity than it delivers. |
| Lifetimes | No syntax. The ergonomic cost of encoding lifetimes manually in TypeScript is prohibitive. |

---

## Risks and mitigations

### 1. Existing art

`neverthrow`, `ts-results`, `oxide.ts` already implement `Result` / `Option` in
TypeScript.

**Mitigation:** JustScript's differentiator is the full suite — branded newtypes,
exhaustive match, `Disposable` patterns, and first-class async — in one coherent
library with zero runtime dependencies. Before adding anything, check whether the
existing libraries cover it and document why they don't in a follow-up ADR note.

---

### 2. Runtime cost — GC pressure

`Result` and `Option` are runtime wrapper objects. Every call creates a heap
allocation the GC must collect. On a hot render path (signal updates at 60 fps,
many concurrent components) this becomes visible GC pressure.

**Mitigation — two rules:**

1. **Use `Result` / `Option` at layer boundaries, not internals.** Transport returns
   `Result<T, TransportError>`. Signal internals store `T` directly. The boundary
   converts.

2. **Fixed object shape for V8.** `{ ok: true, value: T }` and `{ ok: false, error: E }`
   have different shapes — V8's hidden class cache deoptimises on mixed call sites.
   Both `Ok` and `Err` carry all three fields:

   ```typescript
   type Ok<T>  = { readonly ok: true;  readonly value: T;    readonly error: null }
   type Err<E> = { readonly ok: false; readonly value: null;  readonly error: E   }
   ```

   Same shape. V8 monomorphises and optimises.

Note: throwing exceptions is **more expensive** than returning `Result` — stack trace
capture is costly. `Result` is not slower than `try/catch`; it is faster on the error
path.

---

### 3. Async is first-class

Rust's `Result` is synchronous. In TypeScript, the dominant pattern at transport
boundaries is `Promise<Result<T, E>>`. If this is not treated as a first-class type
from the start, callers write `(await x).map(...)` everywhere and the library
becomes awkward to use.

**Mitigation:** `AsyncResult<T, E>` is a named alias and the library ships
`asyncOk()` / `asyncErr()` constructors alongside the synchronous ones. All
combinators have async variants where needed.

---

### 4. Ownership — not all of it is GC-incompatible

The original framing ("lifetimes / ownership / borrow checker — don't try") is too
broad. Three distinct sub-concerns:

| Sub-concern | GC-compatible? | Decision |
|---|---|---|
| Memory deallocation | No | GC handles it — nothing to port |
| Borrow checker / aliasing | No | TypeScript cannot express aliasing rules |
| Deterministic resource cleanup (`Drop`) | **Yes** | Port via `Symbol.dispose` / `using` |
| One-shot / move semantics | **Yes** | Port via type-state pattern |

The `Disposable` and one-shot patterns are explicitly in scope. Memory ownership
and the borrow checker are not.

---

## Key contracts

### `Result<T, E>`

```typescript
type Ok<T>       = { readonly ok: true;  readonly value: T;    readonly error: null }
type Err<E>      = { readonly ok: false; readonly value: null;  readonly error: E   }
type Result<T, E>     = Ok<T> | Err<E>
type AsyncResult<T, E> = Promise<Result<T, E>>

ok(value)                            // Ok<T>
err(error)                           // Err<E>
asyncOk(value)                       // AsyncResult<T, never>
asyncErr(error)                      // AsyncResult<never, E>
mapResult(result, fn)                // Result<U, E>
mapErr(result, fn)                   // Result<T, F>
andThenResult(result, fn)            // Result<U, E>
orElse(result, fn)                   // Result<T, F>
unwrapResultOr(result, fallback)     // T
matchResult(result, { ok, err })     // R
```

### `Option<T>`

```typescript
type Some<T>  = { readonly some: true;  readonly value: T    }
type None     = { readonly some: false; readonly value: null  }
type Option<T> = Some<T> | None

some(value)                          // Some<T>
none                                 // None
fromNullable(value)                  // Option<T>  — bridges null/undefined world
toNullable(option)                   // T | null
mapOption(option, fn)                // Option<U>
andThenOption(option, fn)            // Option<U>
unwrapOptionOr(option, fallback)     // T
matchOption(option, { some, none })  // R
```

### Newtype

```typescript
type Newtype<B extends string, T = string> = T & { readonly [BRAND]: B }

newtype<"FeatureId">("dashboard")    // Newtype<"FeatureId"> — not assignable to plain string
unwrapNewtype(featureId)             // string
```

### Exhaustive match

```typescript
exhaust(value: never): never
// Place in the default arm of a switch or the else of an if-else chain.
// The compiler rejects this call if any union arm is unhandled.
```

### Disposable

```typescript
interface Disposable      { [Symbol.dispose]():        void }
interface AsyncDisposable { [Symbol.asyncDispose](): Promise<void> }

// Usage:
using conn = openConnection()  // conn[Symbol.dispose]() called at scope exit
```

---

## Workspace layout

```
justscript/
  docs/
    3-design/
      ADR-0001-justscript.md    ← this file
  scm/
    main/
      src/
        api/     — type definitions only — zero dependencies
        core/    — constructors and combinators — never imported by consumers
        saf/     — sole public export surface
      package.json
      tsconfig.json
```

Consumers import from the `saf/` surface only:

```typescript
import type { Result, Option, Newtype } from "@justscript/core"
import { ok, err, matchResult, some, none, matchOption, newtype, exhaust } from "@justscript/core"
```
