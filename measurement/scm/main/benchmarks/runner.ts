import { readFileSync }            from "node:fs"
import { fileURLToPath }           from "node:url"
import { join, dirname }           from "node:path"
import { measurementRegistry }     from "@justscript/core"
import { DefaultMeasurementProvider } from "../src/core/default_measurement_provider.js"
import { bench_result_ok, bench_result_ok_raw,
         bench_result_err, bench_result_err_try_catch,
         bench_map_result, bench_map_result_raw }        from "./result_benchmark.js"
import { bench_option_some, bench_option_some_raw,
         bench_option_none, bench_option_none_raw,
         bench_from_nullable, bench_from_nullable_raw }  from "./option_benchmark.js"
import { bench_newtype_create, bench_newtype_create_raw,
         bench_newtype_unwrap, bench_newtype_unwrap_raw } from "./newtype_benchmark.js"

const __dir = dirname(fileURLToPath(import.meta.url))
const base  = JSON.parse(readFileSync(join(__dir, "baseline.json"), "utf-8")) as Record<string, number>

const WARMUP = 3

interface BenchResult { name: string; opsPerSec: number; rawOpsPerSec: number; threshold: number; gcEvents: number }

const provider = new DefaultMeasurementProvider()
measurementRegistry.register(provider)

function warmup(fn: () => number, times: number): void {
  for (let i = 0; i < times; i++) fn()
}

function measure(name: string, fn: () => number, rawFn: () => number, key: string): BenchResult {
  warmup(fn, WARMUP)
  warmup(rawFn, WARMUP)
  provider.resetCounter()
  const opsPerSec    = fn()
  const rawOpsPerSec = rawFn()
  const gcEvents     = provider.report().allocations["gc.events"] ?? 0
  const threshold    = base[key] ?? 0
  return { name, opsPerSec, rawOpsPerSec, threshold, gcEvents }
}

const results: BenchResult[] = [
  measure("result:ok",           bench_result_ok,       bench_result_ok_raw,          "result_ok"),
  measure("result:err",          bench_result_err,      bench_result_err_try_catch,   "result_err"),
  measure("result:mapResult",    bench_map_result,      bench_map_result_raw,         "map_result"),
  measure("option:some",         bench_option_some,     bench_option_some_raw,        "option_some"),
  measure("option:none",         bench_option_none,     bench_option_none_raw,        "option_none"),
  measure("option:fromNullable", bench_from_nullable,   bench_from_nullable_raw,      "from_nullable"),
  measure("newtype:create",      bench_newtype_create,  bench_newtype_create_raw,     "newtype_create"),
  measure("newtype:unwrap",      bench_newtype_unwrap,  bench_newtype_unwrap_raw,     "newtype_unwrap"),
]

measurementRegistry.unregister()

const COL = { name: 24, ops: 14, raw: 14, threshold: 14, gc: 10, status: 8 }
const pad = (s: string, n: number) => s.slice(0, n).padEnd(n)
const fmt = (n: number) => Math.round(n).toLocaleString()

console.log("")
console.log(
  pad("benchmark", COL.name) +
  pad("ops/sec", COL.ops) +
  pad("raw ops/sec", COL.raw) +
  pad("threshold", COL.threshold) +
  pad("gc events", COL.gc) +
  "status",
)
console.log("-".repeat(COL.name + COL.ops + COL.raw + COL.threshold + COL.gc + COL.status))

let failed = false
const failures: string[] = []

for (const r of results) {
  const pass   = r.opsPerSec >= r.threshold
  const status = pass ? "PASS" : "FAIL"
  if (!pass) { failed = true; failures.push(r.name) }

  console.log(
    pad(r.name, COL.name) +
    pad(fmt(r.opsPerSec), COL.ops) +
    pad(fmt(r.rawOpsPerSec), COL.raw) +
    pad(fmt(r.threshold), COL.threshold) +
    pad(String(r.gcEvents), COL.gc) +
    status,
  )
}

console.log("")

if (failed) {
  console.error(`FAIL: ${failures.join(", ")} fell below baseline threshold`)
  process.exit(1)
} else {
  console.log("All benchmarks within baseline thresholds.")
}
