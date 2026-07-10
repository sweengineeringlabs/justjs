# @justjs/platform-mobile

Mobile platform adapter for JustJS — defaults to `../justscript_runtime`'s
(repo: `js-runtime`) native Android shell, not Capacitor or React Native
(justjs#16).

## Why this default

Plain `@justjs/browser` component output is shell-agnostic by design — it
runs inside any WebView, including a native app's own embedded one. `js-runtime`
already has a real, hardware-verified Android shell (`scm/android-shell/` in
that repo) that loads a `justc`-compiled JS bundle into a system WebView,
bridged to native device APIs via JNI. This package provides the missing
piece: a real `RuntimeAdapter` and a typed device-capability facade for that
bridge, instead of waiting on justweb#47's (still unstarted) Capacitor/React
Native codegen.

## Platform coverage

**Android only, today.** No iOS shell exists yet in `justscript_runtime` —
nothing to bridge to. The same architecture (system WebView + a thin native
bridge, this time Swift-FFI) is expected to apply once one exists.

## What's real vs. not

Checked directly against `../justscript_runtime`'s
`main/features/mobile-bridge/src/lib.rs`:

| Capability | Status |
|---|---|
| `echo` | real |
| `notify(title, body)` | real |
| `biometricAuth` | real (multi-stage: availability → secure lock screen → prompt → verify) |
| `contacts` | real |
| `camera` | real |
| `health` (step count) | real |
| GPS / location | **not implemented anywhere yet** — not exposed by this package |

## Usage

```typescript
import { createJsRuntimeShellAdapter, createMobileBridge } from "@justjs/platform-mobile"
import { justjs } from "@justjs/application"

await justjs.boot({
  runtimeAdapter: createJsRuntimeShellAdapter(),
  // ...
})

const bridge = createMobileBridge()
const { steps } = await bridge.health()
```

`createMobileBridge()`'s methods only work when running inside
`justscript_runtime`'s `android-shell` WebView (where `window.AndroidBridge`
is injected) — calling them anywhere else throws a clear `MobileBridgeError`.

## Real-hardware verification (justjs#16, closed 2026-07-10)

Verified end-to-end on a real Samsung SM-A055F over wireless `adb`: a real
justweb-generated component — `button_component.gen.ts` from justweb's own
`webschema` test fixtures, copied verbatim, not hand-written — compiles via
`justc build --target js --bundle --format iife`, mounts through
`@justjs/application`'s actual `boot()` → `adaptCustomElementRegistry` →
`DefaultRouter.navigate()` → `DefaultLifecycle` pipeline (not bypassed the
way `android-shell`'s original hand-written `homeComponent` had to be), and
renders correctly inside `android-shell`'s live WebView with
`JsRuntimeShellAdapter` as its `RuntimeAdapter`. Confirmed live via
`chromiumctl-cli --package` against the real WebView:
`document.querySelector('jsc-button')` came back `instanceof
customElements.get('jsc-button')` with `role="button"` set by the real
component's own `connectedCallback()`. Clicking it round-tripped through
`createMobileBridge().notify()` → the real `window.AndroidBridge` → JNI →
`main/features/mobile-bridge`'s Rust `dispatch()` → a real Android
`NotificationRecord`, confirmed via `adb shell dumpsys notification`. See
`../../justscript_runtime/scm/app/` for the entry script and
`vendor/VENDOR.md` for how it's built and vendored.

### Bugs found and fixed along the way

Getting here surfaced a real, reproducible `justc` 0.3.4 bug (isolated to a
minimal, justjs-independent repro): its `iife`/`cjs` bundle-lowering drops
any function/method/constructor parameter that carries a default-value
expression (`x: T = defaultExpr`) from the emitted signature, while leaving
the body's reference to that parameter intact — a silent
`ReferenceError` at runtime for every caller, not just ones that omit the
argument. Three call sites in this package's dependency chain hit it and
were rewritten to resolve the default inside the function body instead of
in the parameter list (functionally identical, just compiler-portable):
`MountStep`'s `runtimeAdapter` (`@justjs/application`),
`JsRuntimeShellBridge`'s `dispatch()`/`echo()` `args`/`positional`/`flags`
(this package), and `DefaultCacheAdapter.set()`'s `ttl` (`@justjs/transport`).
The `justc` bug itself is unfixed upstream — worth filing against
`justscript_compiler` with the minimal repro if it hasn't been already.
