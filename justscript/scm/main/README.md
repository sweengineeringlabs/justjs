# @justscript/core

JustScript ports ~5 Rust concepts to TypeScript. It is not a Rust-to-WASM tool and has no Rust dependency.

## Primitives

| Primitive | Rust concept | Description |
|-----------|-------------|-------------|
| `Result<T, E>` / `Ok<T>` / `Err<E>` | `Result<T, E>` | Explicit error propagation without exceptions |
| `Option<T>` / `Some<T>` / `None` | `Option<T>` | Explicit absence without null surprises |
| `Newtype<B, T>` | newtype pattern | Nominal typing over structural primitive aliases |
| `exhaust(never)` | `match` exhaustiveness | Compile-time guarantee all union arms are handled |
| `OneShotHandle<T>` | linear types (approx.) | Type-state handle that enforces single-consume at call-site |
| `Disposable` / `AsyncDisposable` | `Drop` trait | `using` / `await using` resource management |

## Usage

```typescript
import { ok, err, some, none, newtype, exhaust, oneShot, makeDisposable } from "@justscript/core"

// Result
const r = ok(42)
if (r.ok) console.log(r.value) // 42

// Option
const o = some("hello")
if (o.some) console.log(o.value) // hello

// Newtype — distinct type at compile time, zero cost at runtime
type UserId = Newtype<"UserId">
const id = newtype<"UserId">("u-1")

// Exhaustive match
type Direction = "up" | "down"
function move(d: Direction): string {
  switch (d) {
    case "up":   return "north"
    case "down": return "south"
    default:     return exhaust(d)
  }
}

// OneShot
const handle = oneShot(() => expensiveComputation())
const [result, _token] = handle.consume() // safe
handle.consume() // throws OneShotError at runtime; Consumed type prevents reuse

// Disposable
using conn = makeDisposable(openConnection(), c => c.close())
// conn.close() is called automatically at scope exit
```

## V8 monomorphism

`Ok` and `Err` share the same object shape `{ ok, value, error }`. Absent fields are `null`, never `undefined`. This keeps both in the same V8 hidden class so property access is always monomorphic.

## Measurement SPI

Install `@justscript/measurement` to track allocation counts:

```typescript
import { AllocationCounter, measurementRegistry } from "@justscript/measurement"

const counter = new AllocationCounter()
measurementRegistry.register(counter)

ok(1); err("x"); some("y"); none()

console.log(counter.report().allocations)
// { "Result.Ok": 1, "Result.Err": 1, "Option.Some": 1, "Option.None": 1 }

measurementRegistry.unregister()
```
