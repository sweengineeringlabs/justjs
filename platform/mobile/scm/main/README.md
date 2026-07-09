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

## Known gap

Nobody has yet verified that a *real* justweb-generated component (as
opposed to this package's own hand-written tests, or `android-shell`'s
current hand-written smoke-test component) compiles via `justc` and renders
correctly inside `android-shell`. That's the one unverified link in this
chain — see justjs#16.
