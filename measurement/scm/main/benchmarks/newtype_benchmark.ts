import { newtype, unwrapNewtype } from "@justscript/core"
import type { Newtype }           from "@justscript/core"

type UserId = Newtype<"UserId">

const ITERATIONS = 10_000

export function bench_newtype_create(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    newtype<"UserId">(`user-${i}`)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_newtype_create_raw(): number {
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _s: string = `user-${i}`
    void _s
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_newtype_unwrap(): number {
  const id: UserId = newtype<"UserId">("user-42")
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    unwrapNewtype(id)
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}

export function bench_newtype_unwrap_raw(): number {
  const s: string = "user-42"
  const start = performance.now()
  for (let i = 0; i < ITERATIONS; i++) {
    const _v: string = s
    void _v
  }
  const elapsed = performance.now() - start
  return ITERATIONS / (elapsed / 1000)
}
