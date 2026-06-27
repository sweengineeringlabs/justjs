# Developer Guide — JustScript

Quick-start guide for developers. When to use JustScript, when to skip it, and the trade-offs.

---

## TL;DR

**Use JustScript at system boundaries.** API handlers, middleware, validation pipelines. Type safety prevents bugs; wrapper overhead is invisible next to I/O.

**Don't use JustScript in hot loops.** Algorithmic code, tight iterations. Raw values or exceptions are faster; correctness is already obvious from the algorithm.

---

## Quick Start

### Installation

```bash
bun add @justscript/core
```

### First Result

```typescript
import { ok, err, matchResult } from "@justscript/core"

async function fetchUser(id: string) {
  const response = await fetch(`/users/${id}`)
  if (!response.ok) return err(new Error("Not found"))
  const data = await response.json()
  return ok(data)
}

const result = await fetchUser("u-123")
matchResult(result, {
  ok: (user) => console.log(user.name),
  err: (error) => console.error(error.message)
})
```

### First Option

```typescript
import { some, none, matchOption } from "@justscript/core"

function findUser(id: string, users: User[]): Option<User> {
  const user = users.find((u) => u.id === id)
  return user ? some(user) : none()
}

const result = findUser("u-123", users)
matchOption(result, {
  some: (user) => console.log(user),
  none: () => console.log("Not found")
})
```

### First Newtype

```typescript
import { Newtype, newtype, unwrapNewtype } from "@justscript/core"

type UserId = Newtype<"UserId">

const id: UserId = newtype<"UserId">("u-123")
const apiUrl = `/users/${unwrapNewtype(id)}`
```

---

## Decision Framework

### ✅ Use JustScript When

| Scenario | Why | Example |
|---|---|---|
| **API route handlers** | I/O dominates; type safety prevents silent failures | `POST /users` — fetchUser + validation + error handling |
| **Middleware chains** | Composable error propagation | Auth → logging → request validation |
| **Validation pipelines** | Explicit error messaging for each step | Form → email validation → uniqueness check |
| **Event handlers** | Clear error paths for event processing | WebSocket message → parse → validate → store |
| **Database queries** | Type-safe result handling | Query returns `Result<User[], DbError>` |
| **Third-party API calls** | Explicit fallback/retry logic | Stripe API → handle timeout → use fallback |
| **Resource cleanup** | Deterministic with `using` keyword | Open DB connection → auto-close at scope exit |

**Common thread:** You're at a boundary (network, database, user input). I/O dominates. Type safety cost is invisible.

### ❌ Don't Use JustScript When

| Scenario | Why | Alternative |
|---|---|---|
| **Tight loops (>1M ops/sec)** | 169 ns wrapper × 1M = 169 ms overhead | Raw values or exceptions |
| **Inner algorithm** | correctness is obvious from logic | `function sort(arr: number[]): number[]` |
| **Performance-critical section** | latency budget is nanoseconds | Profile first, use Rust if needed |
| **One-off scripts** | correctness isn't the bottleneck | Bash or raw TS |
| **Rapid prototyping** | speed of change > type safety | Add JustScript when stabilizing |

**Common thread:** You're in pure computation, not I/O. Boilerplate cost outweighs safety benefit.

---

## Cost-Benefit Analysis

### Absolute Latency

| Operation | Latency | vs Raw |
|---|---|---|
| `ok(value)` | 212 ns | +169 ns |
| `some(value)` | 70 ns | +23 ns |
| `newtype()` | 138 ns | parity |

### In Real Workloads

| Context | Impact | Verdict |
|---|---|---|
| HTTP request (10 ms I/O) | `ok()` adds 212 ns = **2.1 μs overhead** | Invisible ✅ |
| Database query (100 ms I/O) | `ok()` adds 212 ns = **0.2 μs overhead** | Invisible ✅ |
| Signal render (16.7 ms frame) | 100 `ok()` calls = **21.2 μs overhead** | Invisible ✅ |
| 1M tight loop | 1M × 169 ns = **169 ms overhead** | Not acceptable ❌ |

**Rule of thumb:** If the I/O is >100 μs, JustScript wrapper is <0.2% of latency. Use it.

---

## The Real ROI: Bugs at Compile Time

### Without JustScript

```typescript
// ❌ Error path invisible
async function handleRequest(req) {
  const user = await fetchUser(req.id)  // What if fetch fails?
  const prefs = await fetchPreferences(user.id)  // What if this fails?
  return { user, prefs }
}

// This code compiles. It will crash at runtime when fetch fails.
// The bug surfaces in production, not in code review.
```

### With JustScript

```typescript
// ✅ Error path explicit
async function handleRequest(req): Promise<Result<Data, Error>> {
  const userResult = await fetchUser(req.id)
  
  // Compiler forces you to handle the error
  return matchResult(userResult, {
    ok: (user) => {
      return andThenResult(
        await fetchPreferences(user.id),
        (prefs) => ok({ user, prefs })
      )
    },
    err: (error) => err(error)
  })
}

// You cannot forget the error path. Compiler rejects it.
// Bugs surface during code review, not in production.
```

### The Incidents Prevented

**Incident 1: Silent Null**
```typescript
// Without: user.email causes 500 if user is null (shipped to prod)
// With: Option<User> forces check at compile time
```

**Incident 2: Unhandled Error**
```typescript
// Without: API call fails, no error handler, request hangs (shipped to prod)
// With: Result<T, E> forces handler at compile time
```

**Incident 3: Mixed IDs**
```typescript
// Without: updateUser(featureId) passes wrong ID, silent data corruption
// With: Newtype<"UserId"> prevents this at compile time
```

**Cost of each incident:** Hours of debugging + user impact + reputation + incident response.  
**Cost of using JustScript:** 5x slower (but still 169 ns) + learning curve.

**ROI:** 1 incident prevented >> 100 hours of JustScript overhead.

---

## Patterns Cheat Sheet

### Error Propagation

```typescript
// Chain operations with automatic error propagation
const result = await andThenResult(
  await fetchUser("u-123"),
  async (user) => await fetchPreferences(user.id)
)
// If fetch fails, short-circuit. Result is the error.
```

### Fallback Logic

```typescript
// Try A, fall back to B
const config = orElse(
  loadUserConfig(userId),
  () => loadDefaultConfig()
)
```

### Transforming Values

```typescript
// Transform without unwrapping
const doubled = mapResult(divide(10, 2), (value) => value * 2)
// Result { ok: true, value: 10 }
```

### Type-Safe IDs

```typescript
type UserId = Newtype<"UserId">
type FeatureId = Newtype<"FeatureId">

const uid: UserId = newtype<"UserId">("u-123")
const fid: FeatureId = uid  // ✅ Compile error
```

### Resource Cleanup

```typescript
{
  using conn = makeDisposable(openSocket(), (s) => s.close())
  await conn.send(...)
  // conn.close() called automatically at scope exit
}
```

---

## Common Questions

### Q: Should I use Result or throw exceptions?

**A:** Use Result at boundaries (API handlers, middleware). Use exceptions inside functions where the error is truly exceptional. Example:

```typescript
// ✅ Correct: Result at boundary
async function handleRequest(req): Promise<Result<Response, HttpError>> {
  const user = await fetchUser(req.id)
  return matchResult(user, {
    ok: (u) => ok(new Response(JSON.stringify(u))),
    err: (e) => err(new HttpError(500, e.message))
  })
}

// ✅ Correct: Exception inside (non-recoverable)
function parseJson(str: string): User {
  try {
    return JSON.parse(str) as User
  } catch {
    throw new Error("Invalid JSON")  // Non-recoverable, propagate
  }
}
```

### Q: Should every function return Result?

**A:** No. Return Result at boundaries. Inside, work with unwrapped values:

```typescript
// ✅ API boundary returns Result
async function getUser(id: string): Promise<Result<User, NotFoundError>> {
  if (!id) return err(new NotFoundError("id required"))
  const user = await db.users.findOne(id)
  return user ? ok(user) : err(new NotFoundError(id))
}

// ✓ Inside handler, work with unwrapped User
function formatUserEmail(user: User): string {
  // user is guaranteed to exist; no Result needed
  return user.email.toLowerCase()
}
```

### Q: Is Newtype zero-cost?

**A:** Yes. The brand is erased at runtime. `unwrapNewtype()` is a simple cast:

```typescript
type UserId = Newtype<"UserId">
const uid = newtype<"UserId">("u-123")
const str = unwrapNewtype(uid)  // Returns "u-123" directly, no overhead
```

Measured: identical performance to raw string.

### Q: Can I use JustScript with my framework (React, Express, etc)?

**A:** Yes. JustScript is framework-agnostic. Use it at your boundary:

```typescript
// Express
app.get("/users/:id", async (req, res) => {
  const result = await fetchUser(req.params.id)
  matchResult(result, {
    ok: (user) => res.json(user),
    err: (error) => res.status(404).json({ error: error.message })
  })
})

// React
function UserComponent({ userId }: { userId: string }) {
  const [result, setResult] = useState<Result<User, Error>>(null)
  
  useEffect(() => {
    fetchUser(userId).then(setResult)
  }, [userId])
  
  return matchOption(result, {
    some: (r) => matchResult(r, {
      ok: (user) => <div>{user.name}</div>,
      err: (e) => <div>Error: {e.message}</div>
    }),
    none: () => <div>Loading...</div>
  })
}
```

---

## Performance Tuning

### Profile Before Optimizing

If you suspect JustScript is slow:

```bash
# Measure with benchmarks
bun run --filter @justscript/measurement bench

# Profile with bun inspect
bun --inspect ./your_code.ts
```

Most slowness is I/O, not wrappers. Optimize I/O first (caching, batching, connections).

### When to Drop JustScript

If profiling shows JustScript is the bottleneck (rare):

1. **Isolate the hot section** — use raw values there only
2. **Measure impact** — confirm it's worth optimizing
3. **Consider Rust** — if it's truly critical, consider Rust for that section

Example:

```typescript
// Hot loop — raw values
function batchProcess(items: Item[]): number[] {
  return items.map((item) => item.value * 2)  // No Result wrapper
}

// At boundary — Result for error handling
async function processBatch(ids: string[]): Promise<Result<number[], Error>> {
  const items = await loadItems(ids)
  return matchResult(items, {
    ok: (loaded) => ok(batchProcess(loaded)),
    err: (error) => err(error)
  })
}
```

---

## Troubleshooting

**Q: "Cannot find module '@justscript/core'"**  
A: `bun add @justscript/core` or check `bun.lock`

**Q: "Property 'value' is not defined on type 'Err'"**  
A: Use `matchResult` or check `result.ok` first. Err has no value; Ok has no error.

**Q: "OneShotError: called more than once"**  
A: You called `.consume()` twice. Each handle is one-shot only.

**Q: "Type error: cannot assign UserId to ProductId"**  
A: Brands prevent this intentionally. Use `unwrapNewtype()` if you need the raw value.

---

## Next Steps

- **Quick patterns:** See `patterns.md`
- **Deep dive:** See `architecture.md`
- **Design rationale:** See `ADR-0001-justscript.md`
- **Operations:** See `docs/7-operations/runbook.md`
