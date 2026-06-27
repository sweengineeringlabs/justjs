import { some, none, fromNullable } from "@justscript/core"

const ITERATIONS = 10_000

export function bench_option_some(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    some(i)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_option_some_raw(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _o = { some: true as const, value: i }
    void _o
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_option_none(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    void none()
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_option_none_raw(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _n: number | null = null
    void _n
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_from_nullable(): number {
  const values: Array<number | null> = [1, null, 2, null, 3]
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    fromNullable(values[i % values.length]!)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_from_nullable_raw(): number {
  const values: Array<number | null> = [1, null, 2, null, 3]
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const v = values[i % values.length]
    const _o = v != null ? v : null
    void _o
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}
