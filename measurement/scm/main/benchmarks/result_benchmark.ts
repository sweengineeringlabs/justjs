import { ok, err, mapResult } from "@justscript/core"

const ITERATIONS = 10_000

export function bench_result_ok(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    ok(i)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_result_ok_raw(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _r = { ok: true as const, value: i }
    void _r
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_result_err(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    err(new Error("boom"))
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_result_err_try_catch(): number {
  let count = 0
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    try {
      if (i % 2 === 0) throw new Error("boom")
      count++
    } catch {
      count++
    }
  }
  void count
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_map_result(): number {
  const r = ok(42)
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    mapResult(r, v => v + 1)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_map_result_raw(): number {
  const r = { ok: true as const, value: 42 }
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _result = r.ok ? { ok: true as const, value: r.value + 1 } : r
    void _result
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}
