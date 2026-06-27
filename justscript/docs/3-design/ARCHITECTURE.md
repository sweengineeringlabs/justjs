# Architecture — JustScript

Overview of JustScript's layered design, module organization, and integration patterns.

**See also:** `ADR-0001-justscript.md` (design rationale, risks, mitigations)

---

## Design Principle

**Rust principles, JavaScript runtime.**

JustScript ports five Rust concepts to TypeScript:
1. `Result<T,E>` — explicit error handling
2. `Option<T>` — explicit optionality
3. Branded types (Newtype) — domain type safety
4. Exhaustive `match` — union arm completeness
5. `Disposable` / `Drop` — deterministic cleanup

All others (ownership, borrow checker, lifetimes) are incompatible with GC and not ported.

---

## Workspace Structure

```
justscript/
├── scm/main/
│   ├── src/
│   │   ├── api/            # Types only (contracts)
│   │   │   ├── result.ts       # Result<T,E>, Ok<T>, Err<E>, AsyncResult<T,E>
│   │   │   ├── option.ts       # Option<T>, Some<T>, None
│   │   │   ├── newtype.ts      # Brand<B>, Newtype<B,T>
│   │   │   ├── control.ts      # OneShotHandle<T>, Consumed
│   │   │   ├── dispose.ts      # Disposable, AsyncDisposable
│   │   │   ├── match.ts        # exhaust(never)
│   │   │   └── measurement.ts  # MeasurementProvider, MeasurementReport
│   │   ├── core/           # Implementations
│   │   │   ├── result.ts           # ok(), err(), asyncOk(), asyncErr()
│   │   │   ├── result_combinators.ts # mapResult, andThenResult, matchResult, ...
│   │   │   ├── option.ts           # some(), none(), fromNullable(), toNullable()
│   │   │   ├── option_combinators.ts
│   │   │   ├── newtype.ts          # newtype(), unwrapNewtype()
│   │   │   ├── exhaust.ts          # exhaust(value): never
│   │   │   ├── dispose.ts          # makeDisposable()
│   │   │   ├── async_dispose.ts    # makeAsyncDisposable()
│   │   │   ├── one_shot.ts         # oneShot(), OneShotError
│   │   │   └── measurement_registry.ts
│   │   ├── saf/            # Service Abstraction Facade (sole public surface)
│   │   │   └── index.ts        # All exports, types only in exports['.']
│   │   ├── spi/            # Service Provider Implementation
│   │   │   └── index.ts        # measurementRegistry self-registration hook
│   │   └── tests/          # Test suite
│   │       ├── result_test.ts, result_combinators_test.ts
│   │       ├── option_test.ts, option_combinators_test.ts
│   │       ├── newtype_test.ts
│   │       ├── one_shot_test.ts
│   │       ├── exhaust_test.ts
│   │       ├── dispose_test.ts
│   │       └── measurement_test.ts
│   ├── benchmarks/         # Performance suite
│   │   ├── runner.ts           # Main benchmark harness
│   │   ├── result_benchmark.ts
│   │   ├── option_benchmark.ts
│   │   ├── newtype_benchmark.ts
│   │   └── baseline.json       # Threshold floor for CI
│   ├── package.json        # @justscript/core, zero runtime deps
│   ├── tsconfig.json       # Project references, composite: true
│   └── README.md
│
├── docs/3-design/
│   ├── ADR-0001-justscript.md  # Design rationale & risks
│   ├── ARCHITECTURE.md          # This file
│   └── PATTERNS.md              # Usage patterns & idioms
│
├── docs/6-deployment/
│   └── PLAYBOOK.md          # Publishing to npm
│
└── docs/7-operations/
    ├── RUNBOOK.md           # Troubleshooting & procedures
    └── reports/
        └── MEASUREMENT_*.md # Benchmark reports
```

---

## Module Organization

### Layer 1: API (Types Only)

**Location:** `src/api/`  
**Rule:** Zero function bodies. Types, interfaces, `declare function`, `const enum` only.  
**Visibility:** Private — never imported by consumers directly.

Each file defines contracts for one concern:
- `result.ts` — `Result<T,E>`, `Ok<T>`, `Err<E>`, `AsyncResult<T,E>` (types)
- `option.ts` — `Option<T>`, `Some<T>`, `None` (types)
- And so on.

**Why:** Decouples contract definition from implementation. Allows swapping implementations without breaking consumers.

### Layer 2: Core (Implementation)

**Location:** `src/core/`  
**Rule:** All function bodies, classes, constructors.  
**Visibility:** Private — never imported by consumers directly.

Mirrors `api/` structure. Each file implements the types from `api/`:
- `result.ts` — implements `Ok<T>`, `Err<E>` constructors
- `result_combinators.ts` — implements `mapResult`, `matchResult`, etc.

**Naming:** Functions are verbs (Rust idiom): `ok()`, `err()`, `some()`, `none()`, `newtype()`, `exhaust()`

### Layer 3: SAF (Service Abstraction Facade)

**Location:** `src/saf/index.ts`  
**Rule:** Sole public surface. `exports['.']` points here. Re-exports from `core/`, nothing else.  
**Visibility:** **Public** — this is what consumers import.

```typescript
// src/saf/index.ts
export { ok, err, asyncOk, asyncErr } from "../core/result.js"
export { mapResult, andThenResult, ... } from "../core/result_combinators.js"
export { some, none, fromNullable, toNullable } from "../core/option.js"
// ... all public exports
```

Consumers only ever write:
```typescript
import { ok, err, Result } from "@justscript/core"  // ✅ via SAF
import { ok } from "@justscript/core/dist/core/result.js"  // ❌ Wrong, don't do this
```

### Layer 4: SPI (Service Provider Implementation)

**Location:** `src/spi/`  
**Rule:** Re-exports hook points for extension. Self-registration only.  
**Current use:** `measurementRegistry`

```typescript
// src/spi/index.ts
export { measurementRegistry } from "../core/measurement_registry.js"
```

Allows consumers to hook in measurement providers without core depending on measurement:

```typescript
import { measurementRegistry } from "@justscript/core/dist/spi/index.js"
// Register a provider — measurement hooks fire when core constructors run
```

**Why separate from SAF:** Stabilize the public API (`saf/`) while allowing experimental extensions via SPI.

---

## Data Flow

### Happy Path: API → Core → SAF

```
Consumer imports from @justscript/core
        ↓
SAF (saf/index.ts) re-exports public API
        ↓
Core module executes, measurements hook if registered
        ↓
Returns Result/Option to caller
```

### Measurement Hook (Optional)

```
ok() constructor called
        ↓
Check: measurementRegistry.current !== null?
        ↓
YES: call measurementRegistry.current.onConstruct("Result.Ok")
  ↓ [AllocationCounter increments counter]
  ↓ [or DefaultMeasurementProvider counts GC events]
        ↓
NO: skip hook (null check only, zero cost)
        ↓
Return { ok: true, value, error: null }
```

---

## Type Guarantees

### V8 Monomorphism

Both `Ok` and `Err` have identical field set:

```typescript
type Ok<T>  = { readonly ok: true;  readonly value: T | null; readonly error: null }
type Err<E> = { readonly ok: false; readonly value: null;      readonly error: E }
```

Same hidden class → V8 JIT monomorphises → no deoptimization on mixed call sites.

**Measured:** 4.7M ops/sec, well above 500k threshold.

### Phantom Brands

```typescript
declare const _brand: unique symbol
type Brand<B extends string> = { readonly [_brand]: B }
type Newtype<B extends string, T = string> = T & Brand<B>
```

The `Brand` symbol exists only at compile time. At runtime, `Newtype<"UserId">` is structurally identical to `string`. But the compiler prevents:

```typescript
type UserId = Newtype<"UserId">
type ProductId = Newtype<"ProductId">

const uid: UserId = newtype<"UserId">("u-1")
const pid: ProductId = uid  // ✅ Type error at compile time
```

**Cost:** Zero. Brand is erased.

### Exhaustiveness

Discriminated unions + exhaustive matching:

```typescript
type Result<T,E> = Ok<T,E> | Err<T,E>

function matchResult<T,E,R>(
  result: Result<T,E>,
  handlers: { ok: (v: T) => R, err: (e: E) => R }
): R {
  switch (result.ok) {
    case true:  return handlers.ok(result.value)
    case false: return handlers.err(result.error)
    default:    return exhaust(result)  // ✅ result: never — compile error if 3rd arm added
  }
}
```

Adding a third variant to `Result` would make `result` non-`never` in the default branch → compile error.

---

## Integration Patterns

### Pattern 1: Simple Error Path

```typescript
import { ok, err, matchResult } from "@justscript/core"

async function fetchUser(id: string): Promise<Result<User, NotFoundError>> {
  const response = await fetch(`/users/${id}`)
  if (!response.ok) return err(new NotFoundError(id))
  const data = await response.json()
  return ok(data as User)
}

// Caller
const result = await fetchUser("u-123")
matchResult(result, {
  ok: (user) => console.log(user.name),
  err: (err) => console.error(err.message)
})
```

### Pattern 2: Chaining Async Operations

```typescript
import { ok, andThenResult } from "@justscript/core"

const result = await andThenResult(
  await fetchUser("u-123"),
  async (user) => {
    return await fetchUserPreferences(user.id)
  }
)
```

### Pattern 3: Type-Safe Domain IDs

```typescript
import { Newtype, newtype, unwrapNewtype } from "@justscript/core"

type UserId = Newtype<"UserId">
type FeatureId = Newtype<"FeatureId">

const uid: UserId = newtype<"UserId">("u-123")
const fid: FeatureId = uid  // ✅ Compile error — UserId ≠ FeatureId

// At API boundary
const apiResponse = await fetch(`/users/${unwrapNewtype(uid)}/features`)
```

### Pattern 4: Resource Cleanup

```typescript
import { makeDisposable } from "@justscript/core"

function openConnection(): Disposable {
  const conn = new WebSocket(...)
  return makeDisposable(conn, (c) => c.close())
}

// Caller — cleanup automatic at scope exit
{
  using conn = openConnection()
  await conn.send(...)
  // conn.close() called automatically here
}
```

### Pattern 5: One-Shot Consumer

```typescript
import { oneShot } from "@justscript/core"

const handle = oneShot(() => expensiveComputation())
const [result, _token] = handle.consume()  // ✅ Safe
const [again] = handle.consume()  // ❌ Runtime error: OneShotError
```

Type system enforces at compile time via `Consumed` type.

---

## Performance Characteristics

| Operation | Latency | Throughput | vs Raw |
|---|---|---|---|
| `ok()` | 212 ns | 4.7M ops/sec | 5x slower |
| `err()` | 1,422 ns | 703k ops/sec | 1.1x slower |
| `some()` | 70 ns | 14.2M ops/sec | 1.5x slower |
| `none()` | 18 ns | 56.5M ops/sec | 3.7x slower |
| `newtype:create` | 138 ns | 7.2M ops/sec | parity |
| Measurement null-check | <1 ns | — | invisible |

**Guidance:**
- ✅ **Use at boundaries** (API handlers, validation) — I/O dominates
- ❌ **Don't use in hot loops** (>1M calls/sec) — accumulates 169+ ms overhead

See `docs/7-operations/reports/` for detailed benchmarks.

---

## Contracts & Invariants

### Workspace Invariants

- `api/` has zero function bodies
- `core/` has zero public exports (internal only)
- `saf/` re-exports from `core/` only
- `src/` excludes `tests/` and `benchmarks/`
- `package.json` has zero runtime `dependencies`
- `package.json` `type: "module"` and ESM exports

### Type Invariants

- `Ok<T>` and `Err<E>` carry all three fields `{ ok, value, error }` (V8 monomorphism)
- `Option<T> = Some<T> | None` (closed discriminated union)
- `Result<T,E> = Ok<T,E> | Err<T,E>` (closed discriminated union)
- `Newtype<B,T>` brand is phantom (erased at runtime)
- `Consumed` type has no methods (prevents reuse at compile time)

### Runtime Invariants

- No allocations in measurement hook when `current === null`
- GC event count stable across benchmark runs (≤2% variance)
- All tests pass in workspace isolation (`bun install && bun test`)

---

## Next Steps

See:
- **`PATTERNS.md`** — common usage idioms
- **`ADR-0001-justscript.md`** — design rationale and trade-offs
- **`docs/6-deployment/PLAYBOOK.md`** — npm publishing workflow
- **`docs/7-operations/RUNBOOK.md`** — troubleshooting and monitoring
