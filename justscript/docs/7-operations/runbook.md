# Operations Runbook — JustScript Workspaces

Troubleshooting and operational procedures for `@justscript/core` and `@justscript/measurement`.

## Health checks

### Quick health check

```bash
cd justscript/scm/main

# Verify workspace builds in isolation
bun install
bun run build
bun run typecheck
bun test
```

Exit code 0 on all means healthy.

### Full monorepo check

From repo root:
```bash
bun run --filter "@justscript/*" build
bun test --filter justscript
bun test --filter measurement
bun run typecheck
```

### Benchmark regression detection

```bash
cd measurement/scm/main
bun run bench
```

Expected output: all benchmarks show `PASS` status. If any show `FAIL`, a performance regression is present.

## Common issues

### Build fails: "Cannot find module"

**Symptom:** `error: Cannot find module 'src/api/result.js'`

**Cause:** Stale build artifacts or incorrect path resolution.

**Fix:**
```bash
# Clean and rebuild
rm -rf justscript/scm/main/dist measurement/scm/main/dist
bun run --filter "@justscript/*" build
```

### Tests fail with "OneShotError"

**Symptom:** `OneShotError: called more than once`

**Cause:** A test is reusing a consumed handle or a oneShot handle twice in production code.

**Fix:**
- In tests: verify `@ts-expect-error` guards reuse attempts — they should fail at compile time first.
- In production: ensure `consume()` is called exactly once per handle.

### Measurement hooks not firing

**Symptom:** `provider.report().allocations` is empty after calling `ok()`, `err()`, etc.

**Cause:** Provider not registered, or measurement singleton not imported correctly.

**Fix:**
```typescript
// ✅ Correct: import from spi/ in source
import { measurementRegistry } from "../spi/index.js"

// ✅ Correct: register before constructing
measurementRegistry.register(new AllocationCounter())
ok(42)
console.log(measurementRegistry.current?.report().allocations)

// ❌ Wrong: importing compiled dist when source uses relative path
import { measurementRegistry } from "@justscript/measurement"  // gets different singleton instance
```

Use `../spi/index.js` imports in source code; `@justscript/measurement` (package) imports only in external consumers.

### Benchmark threshold breaches

**Symptom:** `FAIL: result:ok fell below baseline threshold`

**Cause:** Real performance regression or environment variance (GC, CPU load).

**Procedure:**
1. Run benchmark 3 times to rule out variance:
   ```bash
   bun run bench
   bun run bench
   bun run bench
   ```
   
2. If still fails, investigate:
   - Check if a core implementation changed recently: `git log -p --follow -- justscript/scm/main/src/core/result.ts`
   - Profile with `bun --inspect` to find hot spots
   - Check system load: `top` or Task Manager

3. If it's a real regression:
   - Fix the implementation
   - Re-run bench to confirm recovery
   - Update `baseline.json` only if the slower version is intentional and correct
   
4. If it's environmental variance:
   - Run on a quieter machine or skip transient failures in CI
   - Consider raising thresholds 10-20% as headroom

### Typecheck fails on monorepo

**Symptom:** `@justscript/core typecheck: Exited with code 1`

**Cause:** Usually a type violation introduced in recent commit.

**Fix:**
```bash
# Show the error
bun run typecheck 2>&1 | grep -A5 "error TS"

# Narrow to workspace
cd justscript/scm/main
bun run typecheck

# Check specific file
cat tsconfig.json  # verify paths
```

Common causes:
- Cast removed without narrowing: `result as T` — should use union narrowing instead
- API function body added — api/ must be types-only
- V8 monomorphism shape broken — Ok/Err must have same keys

## Performance tuning

### Reducing benchmark variance

If you need more stable benchmarks (e.g., for CI):

1. Increase `WARMUP` iterations in `benchmarks/runner.ts`:
   ```typescript
   const WARMUP = 10  // was 3
   ```

2. Increase iterations in each benchmark file:
   ```typescript
   const ITERATIONS = 50_000  // was 10_000
   ```

3. Run on a dedicated machine with pinned CPU frequency.

### Measurement overhead analysis

The zero-overhead phase (Phase 1 of `bun run bench`) measures the null-check cost:

```
ok() no provider            7,278,550 ops/sec  (threshold: 500,000)  PASS
```

If this drops below threshold, the null-check is taking >50% of the time, which is unacceptable. This would indicate:
- A bug in the provider check itself
- Unexpected work in the constructor (check `core/result.ts`)
- Compiler optimization regression (run with different bun/TS version)

## Metrics to watch

| Metric | Healthy range | Action |
|---|---|---|
| Test pass rate | 100% (73/73 core + 19/19 measurement) | Investigate any failure |
| Benchmark spread | ±10% variance run-to-run | Within expected variance |
| GC event count | 0 during benchmarks | If >0, check `PerformanceObserver` setup |
| Build time | <2s for each workspace | Check if dist/ is bloated |
| Typecheck time | <1s monorepo | Cache may be stale |

## Scheduled maintenance

### Monthly
- Run full test suite and benchmark suite
- Check for TypeScript or bun version updates
- Review git log for any uncommitted drift

### Quarterly
- Update `baseline.json` thresholds if codebase optimization is intentional
- Audit policy rule compliance (run on full monorepo)
- Review error messages in oneShot, exhaust for clarity

## Escalation contacts

- **Performance regressions:** @sweengineeringlabs/justscript-reviewers
- **Type violations:** @sweengineeringlabs/typescript-leads
- **Measurement hooks not firing:** Check singleton import path first (see "Measurement hooks not firing" section)
