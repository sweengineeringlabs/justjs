import { bench, run } from "bun:bench"
import { ok, err }    from "../core/result.js"
import { some, none } from "../core/option.js"

bench("ok() allocation", () => {
  ok(42)
})

bench("err() allocation", () => {
  err("failure")
})

bench("ok() + narrowing", () => {
  const r = ok(1)
  if (r.ok) r.value
})

bench("err() + narrowing", () => {
  const r = err("e")
  if (!r.ok) r.error
})

bench("some() allocation", () => {
  some(42)
})

bench("none() allocation", () => {
  none()
})

await run()
