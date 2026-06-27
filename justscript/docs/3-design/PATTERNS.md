# Usage Patterns — JustScript

Common idioms and recipes for using JustScript primitives.

---

## Result Patterns

### Pattern: Straightforward Happy Path + Error

```typescript
import { ok, err, Result, matchResult } from "@justscript/core"

function divide(a: number, b: number): Result<number, DivisionError> {
  if (b === 0) return err(new DivisionError("divide by zero"))
  return ok(a / b)
}

const result = divide(10, 2)
matchResult(result, {
  ok: (value) => console.log(`Result: ${value}`),
  err: (error) => console.error(`Error: ${error.message}`)
})
```

### Pattern: Chaining Operations (Sync)

```typescript
import { andThenResult } from "@justscript/core"

const result = andThenResult(
  fetchUser("u-123"),
  (user) => validateEmail(user.email)
)

matchResult(result, {
  ok: (validatedEmail) => console.log(validatedEmail),
  err: (error) => console.error(error)
})
```

### Pattern: Chaining Operations (Async)

```typescript
import { andThenResult, AsyncResult } from "@justscript/core"

const result: AsyncResult<ValidatedEmail, Error> = andThenResult(
  await fetchUser("u-123"),
  async (user) => await validateEmailAsync(user.email)
)

const final = await result
matchResult(final, {
  ok: (validatedEmail) => console.log(validatedEmail),
  err: (error) => console.error(error)
})
```

### Pattern: Mapping Both Branches

```typescript
import { mapResult, mapErr } from "@justscript/core"

const result = mapResult(divide(10, 2), (value) => value * 2)
// Result<number, DivisionError>

const normalized = mapErr(result, (error) => error.code)
// Result<number, string> (error is now just the code)
```

### Pattern: Providing Fallback

```typescript
import { orElse } from "@justscript/core"

const result = orElse(
  fetchCached("key"),
  () => fetchFromAPI("key")
)
// If fetch fails, try API. Result is the first success or final error.
```

### Pattern: Unwrapping with Default

```typescript
import { unwrapResultOr } from "@justscript/core"

const value = unwrapResultOr(divide(10, 2), 0)
// If divide succeeds, value = result.value. If fails, value = 0.
```

---

## Option Patterns

### Pattern: Handling Presence/Absence

```typescript
import { some, none, Option, matchOption } from "@justscript/core"

function findUser(id: string, users: User[]): Option<User> {
  const user = users.find((u) => u.id === id)
  return user ? some(user) : none()
}

const result = findUser("u-123", users)
matchOption(result, {
  some: (user) => console.log(user.name),
  none: () => console.log("User not found")
})
```

### Pattern: Converting Nullable to Option

```typescript
import { fromNullable } from "@justscript/core"

const config = loadConfig()  // returns Config | null
const opt = fromNullable(config)
// Now opt is Option<Config>, safely handled

matchOption(opt, {
  some: (cfg) => initialize(cfg),
  none: () => console.warn("Using default config")
})
```

### Pattern: Converting Option Back to Nullable

```typescript
import { toNullable } from "@justscript/core"

function getUser(id: string): Option<User> {
  // ... return some(user) or none()
}

// For legacy API that expects null
const user = toNullable(getUser("u-123"))  // returns User | null
```

### Pattern: Chaining Option Operations

```typescript
import { andThenOption } from "@justscript/core"

const result = andThenOption(
  findUser("u-123", users),
  (user) => findPreferences(user.id, prefs)
)
// If user not found, returns none(). If found, returns user's preferences.
```

### Pattern: Mapping Option Values

```typescript
import { mapOption } from "@justscript/core"

const userEmails = mapOption(
  findUser("u-123", users),
  (user) => user.email
)
// userEmails is Option<string> — either the email or none
```

---

## Newtype Patterns

### Pattern: Type-Safe IDs

```typescript
import { Newtype, newtype, unwrapNewtype } from "@justscript/core"

type UserId = Newtype<"UserId">
type FeatureId = Newtype<"FeatureId">
type CorrelationId = Newtype<"CorrelationId", string>

const uid: UserId = newtype<"UserId">("user-123")
const fid: FeatureId = newtype<"FeatureId">("feature-456")

// Compiler prevents mixing
const mixed: UserId = fid  // ✅ Type error

// Extract value for APIs
const api_uid = unwrapNewtype(uid)  // string
const api_fid = unwrapNewtype(fid)  // string

// Use in routes
app.get(`/users/${unwrapNewtype(uid)}/features/${unwrapNewtype(fid)}`, ...)
```

### Pattern: Domain Types (Non-ID)

```typescript
import { Newtype, newtype } from "@justscript/core"

type Milliseconds = Newtype<"Milliseconds", number>
type Kilometers = Newtype<"Kilometers", number>

function delay(ms: Milliseconds): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, unwrapNewtype(ms)))
}

// Caller
delay(newtype<"Milliseconds", number>(5000))  // ✅ Safe
delay(newtype<"Kilometers", number>(5))       // ✅ Type error at compile time
```

### Pattern: Email/URL Validation with Newtype

```typescript
import { Newtype, newtype, Result, ok, err } from "@justscript/core"

type ValidEmail = Newtype<"ValidEmail">

function validateEmail(input: string): Result<ValidEmail, EmailError> {
  if (!input.includes("@")) return err(new EmailError("missing @"))
  return ok(newtype<"ValidEmail">(input) as ValidEmail)
}

// Caller knows email is valid — it's encoded in the type
const result = validateEmail("user@example.com")
matchResult(result, {
  ok: (validEmail) => {
    // validEmail is ValidEmail — guaranteed valid
    // Type system allows only valid emails to reach here
    sendEmail(unwrapNewtype(validEmail))
  },
  err: (error) => console.error(error)
})
```

---

## Exhaustive Match Patterns

### Pattern: Union Exhaustiveness

```typescript
import { exhaust } from "@justscript/core"

type Status = "pending" | "success" | "failure"

function getMessage(status: Status): string {
  switch (status) {
    case "pending":
      return "In progress..."
    case "success":
      return "Done!"
    case "failure":
      return "Failed."
    default:
      return exhaust(status)  // ✅ Type error if new status added
  }
}
```

Adding `| "cancelled"` to `Status` would make `status` non-`never` in the default branch → TypeScript compile error.

### Pattern: Discriminated Union + Exhaustive Match

```typescript
import { exhaust } from "@justscript/core"

type Event = 
  | { kind: "user_joined"; id: string }
  | { kind: "user_left"; id: string }
  | { kind: "message"; text: string }

function handle(event: Event): void {
  switch (event.kind) {
    case "user_joined":
      console.log(`${event.id} joined`)
      break
    case "user_left":
      console.log(`${event.id} left`)
      break
    case "message":
      console.log(event.text)
      break
    default:
      exhaust(event)  // ✅ Compile error if event kind added without handler
  }
}
```

---

## Disposal Patterns

### Pattern: Automatic Resource Cleanup with `using`

```typescript
import { makeDisposable } from "@justscript/core"

function openFile(path: string) {
  const file = fs.openSync(path)
  return makeDisposable(file, (f) => fs.closeSync(f))
}

{
  using f = openFile("data.txt")
  // Use f
  // fs.closeSync(f) is called automatically at scope exit
}
```

### Pattern: Async Resource Cleanup with `await using`

```typescript
import { makeAsyncDisposable } from "@justscript/core"

async function connectDB(url: string) {
  const client = new PgClient(url)
  await client.connect()
  return makeAsyncDisposable(client, async (c) => await c.disconnect())
}

{
  await using db = await connectDB("postgres://...")
  // Use db
  // await db.disconnect() is called automatically at scope exit
}
```

### Pattern: Chaining Disposables

```typescript
import { makeDisposable } from "@justscript/core"

function setup(): Disposable {
  const logger = openLogger()
  const db = openDB()
  const cache = openCache()
  
  return makeDisposable({ logger, db, cache }, (resources) => {
    resources.cache.close()
    resources.db.close()
    resources.logger.close()
  })
}

{
  using resources = setup()
  // Use resources.db, resources.logger, etc.
  // All closed in reverse order at scope exit
}
```

---

## One-Shot Patterns

### Pattern: Expensive Computation, Single Access

```typescript
import { oneShot, OneShotError } from "@justscript/core"

function initializeApp(): Result<AppContext, Error> {
  const handle = oneShot(() => {
    // Expensive: read config, open DB, seed cache, etc.
    return createAppContext()
  })

  const [context, _token] = handle.consume()  // ✅ Compute once
  return ok(context)
}
```

### Pattern: Preventing Accidental Reuse (Type-Safe)

```typescript
import { oneShot } from "@justscript/core"

const handle = oneShot(() => expensiveInitialization())

// First use — success
const [result, consumed] = handle.consume()

// Try reuse
const [again] = handle.consume()  // ❌ OneShotError at runtime

// But compiler already prevented this at type-check time via Consumed type:
function cannotCallAgain(token: Consumed): void {
  // @ts-expect-error — Consumed has no methods
  token.consume()
}
```

---

## Error Handling Philosophy

### Principle 1: Errors are Not Exceptions

```typescript
// ❌ Don't hide errors in exceptions
function fetchUser(id: string): User {
  try {
    return await fetch(`/users/${id}`).then(r => r.json())
  } catch {
    throw new Error("Failed")  // Caller doesn't know about this path
  }
}

// ✅ Make error path explicit
function fetchUser(id: string): Result<User, FetchError> {
  // ...
  if (!response.ok) return err(new FetchError(response.status))
  return ok(data)
}

// Caller must handle the error path
matchResult(result, {
  ok: (user) => ...,
  err: (error) => ...  // Cannot ignore
})
```

### Principle 2: Errors at Boundaries Only

```typescript
// ✅ Return Result at system boundary
async function handleRequest(req: Request): Result<Response, HttpError> {
  const result = await fetchUser(req.userId)
  return matchResult(result, {
    ok: (user) => ok(new Response(JSON.stringify(user))),
    err: (error) => err(new HttpError(500, error.message))
  })
}

// ✓ Inside handler, work with unwrapped values
function processUser(user: User): string {
  // Inside, assume user is valid — no Result needed
  return user.name.toUpperCase()
}
```

### Principle 3: Combine `orElse` for Fallback Logic

```typescript
import { orElse } from "@justscript/core"

const config = orElse(
  loadUserConfig(userId),
  () => loadDefaultConfig()
)
// First try user config. If fails, use default. No try/catch needed.
```

---

## Performance Guidance

### When to Use JustScript

✅ **Boundary handlers** — API routes, event handlers, validation pipelines  
✅ **Async chains** — Observable, chained operations  
✅ **Domain type safety** — NewType for IDs, validated strings  
✅ **Resource cleanup** — `using` / `await using` for deterministic resource release

### When NOT to Use JustScript

❌ **Tight loops** — don't use Result in 1M+ iterations/sec algorithms  
❌ **Performance-critical sections** — if latency is in nanoseconds  
❌ **Already-exceptional paths** — if you're already throwing, stay with try/catch

---

## Testing Patterns

### Pattern: Testing Happy Path

```typescript
it("test_divide_with_valid_numbers_returns_ok", () => {
  const result = divide(10, 2)
  matchResult(result, {
    ok: (value) => expect(value).toBe(5),
    err: () => fail("should not error")
  })
})
```

### Pattern: Testing Error Path

```typescript
it("test_divide_with_zero_returns_err", () => {
  const result = divide(10, 0)
  matchResult(result, {
    ok: () => fail("should error"),
    err: (error) => expect(error.message).toContain("divide by zero")
  })
})
```

### Pattern: Testing Async Results

```typescript
it("test_fetch_user_with_invalid_id_returns_err", async () => {
  const result = await fetchUser("invalid")
  matchResult(result, {
    ok: () => fail("should error"),
    err: (error) => expect(error).toBeInstanceOf(NotFoundError)
  })
})
```
