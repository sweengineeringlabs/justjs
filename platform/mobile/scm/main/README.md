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
| `location()` (justjs#80/#84) | real — `lat`/`lon`/`accuracy` via `LocationManager.getLastKnownLocation()` |

### Keeping this list in sync with `js-runtime` (justjs#84)

`mobile-bridge`'s Rust dispatch (`lib.rs`) has two ways a capability gets
added: a named `match` arm (the original six), or an entry in the
`simple_capabilities` registration table (justjs#80 — no-arg capabilities
that call one Java static method returning a JSON string; `location` was
the first). **Either way is invisible to this package until someone adds
the matching `MobileBridge` method by hand** — `simple_capabilities`
entries especially: they need zero `js-runtime`-side match-arm changes,
so it's easy to add one there and forget this side exists at all (this is
exactly what happened between justjs#80 and justjs#84).

**Convention going forward:** any `js-runtime`-side capability addition
must land a matching typed method on `MobileBridge`
(`api/bridge.ts`)/`JsRuntimeShellBridge`
(`core/js_runtime_shell_bridge.ts`) in the same change, following the
`dispatch()`/`unwrap()` pattern every existing method already uses (see
`health()` for the no-arg/JSON-object-result shape most new capabilities
will match) — not a separate, "get to it eventually" follow-up.

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

## CSS verification (justjs#69, closed 2026-07-10)

The verification above used `button_component.gen.ts` alone, which has no
styling at all — it proved component mounting, not CSS. Real justweb codegen
emits component CSS as a **separate sibling file**
(`button_component.gen.css`), never routed through `justc` at all: real
justweb apps link it as a plain global stylesheet directly in the page's own
HTML (`<link rel="stylesheet" href="....gen.css">`), entirely outside the
compiled JS bundle. The component itself never applies its own BEM classes
(`.button`, `.button--primary`, …) — the consuming app's markup does, same
as any hand-authored HTML.

Verified end-to-end on the same real hardware: `jsc_button_component.gen.css`
(copied verbatim, same source as the `.ts` fixture) copied into
`android-shell`'s APK assets and linked from `index.html`
(`scm/android-shell/build.sh`'s new `--css <path>` flag), with the app
entry adding `class="button button--primary"` to the mounted element.
`chromiumctl-cli eval` against the live WebView confirmed real computed
styles matching the actual CSS rules — `padding: 8px 16px`,
`display: inline-flex`, `cursor: pointer` (from `.button`), and
`background-color: #007bff` / `color: white` (from `.button--primary`) all
came back correct via `getComputedStyle()`. A negative control
(`.button--disabled`'s `opacity: 0.5`, not applied since that class wasn't
added) confirmed the match wasn't coincidental default styling.

No compiler bugs here — CSS delivery bypasses `justc` entirely, so this was
purely a wiring gap (`android-shell`'s build never copied or linked a CSS
file) rather than a compiler-correctness question. Now real, and now real
verified.

## Interactive state verification (justjs#70, closed 2026-07-10)

Both verifications above exercised exactly one interaction: a click firing
`AndroidBridge.notify()`. `ButtonBase` has six other real property setters
(`checked`, `completed`, `disabled`, `expanded`, `invalid`, `loading`,
`selected`) that mutate attributes directly, with no event/bridge dispatch
involved — a distinct code path, never previously exercised on real
hardware.

Verified on the same real hardware: `app.ts` calls `button.disabled = true`
and `button.loading = true` on the mounted element after render. Confirmed
via `chromiumctl-cli eval` against the live WebView (on a genuinely clean
app install — a `-r` reinstall over a running process was found to leave
the previous session's WebView document state behind, giving a false read;
a full uninstall/install cycle is required for a trustworthy check):
`hasAttribute('disabled')`, `getAttribute('aria-disabled')`, and
`getAttribute('aria-busy')` all came back exactly as `ButtonBase`'s real
setter source says they should.

Also answered, with evidence rather than assumption: the generated CSS
targets BEM *classes* (`.button--disabled`), not these DOM *attributes* —
setting `disabled`/`loading` does **not** change `getComputedStyle()`
output (`opacity` stayed `1`, `cursor` stayed `pointer`, not
`.button--disabled`'s `0.5`/`not-allowed`) unless the consuming app also
toggles the matching class itself. Real justweb codegen keeps attribute
state and class-based styling as two independent concerns a consumer must
wire together — not a bug, but worth knowing rather than assuming either
way.

Also confirmed along the way: a synthesized real input event
(`chromiumctl click --selector`, real CDP `Input.dispatchMouseEvent` at the
element's actual on-screen coordinates) drives the same click → bridge →
notification chain correctly, not just a scripted `element.click()` call.

## Reactive re-render verification (justjs#71, closed 2026-07-10)

Found before any test code was written: `adaptCustomElementRegistry`'s
`render()` only ever declared 2 parameters, silently discarding
`RenderStep`'s 3rd (`ComponentDataContext`/`ctx.store`) call argument.
ADR-0004's re-render mechanism depends entirely on a component reading
fresh state off `ctx.store` itself — so no `customElements`-registered
component (the only kind justweb codegen produces) ever had a real path to
receive a `FeatureStore` change, even though `@justjs/application`'s own
unit tests already proved the mechanism works for hand-written
plain-object `Component`s. Fixed in `component_registry_adapter.ts`:
`render()` now forwards `dataContext` as a plain `dataContext` property —
a custom element that wants reactivity defines its own
`set dataContext(ctx)` accessor, the same get/set-accessor idiom real
justweb codegen already uses for declared props/states. Two new unit tests
confirm a real `HTMLElement` subclass receives it correctly (and
confirmed, before shipping, to actually fail without the fix).

Verified end-to-end on the same real hardware: a `FeatureStore` mutation
made well after initial mount produces an observable DOM change on a real
`customElements`-registered element in `android-shell`'s live WebView,
through the real `DefaultRouter` subscription → `rerender()` path — a
minimal hand-written probe element (deliberately not a justweb codegen
artifact, since this route tests `@justjs/application`'s own plumbing, not
codegen fidelity — the same distinction its unit tests already draw)
showed `count: 0` → `count: 1` → `count: 2` → `count: 3` across
successive dispatches, confirmed via `chromiumctl-cli eval`.

### Bugs found and fixed along the way (four more `justc` bugs)

Getting this onto real hardware surfaced four more distinct, reproducible
`justc` 0.3.4 bugs beyond the three from justjs#16:

- **justscript_compiler#14** — `iife`/`cjs` bundling drops all but the
  last `?.` in a chained optional-access expression (`a?.b?.c` →
  `a.b?.c`), a real `TypeError`-throwing correctness bug. Worked around
  with explicit ternaries where hit.
- **justscript_compiler#15** — an aliased import from an external
  (`node_modules`) package (`import { x as y }`) loses the alias binding
  during bundling; the inlined declaration keeps its original name while
  call sites still reference the never-bound alias. `@justjs/data`'s
  `signal.ts` no longer aliases `@preact/signals-core`'s `signal` export.
- **justscript_compiler#16** — more fundamental than #15: an external
  package imported *through* a local/workspace package (rather than
  directly from the entry file) gets silently dropped regardless of
  aliasing — the package's real source is inlined, but nothing ever binds
  it to the name the intermediate package's code calls. This is why
  `js-runtime/main/features/mobile-bridge/tests/fixtures/app/src/app.ts`
  uses a small hand-written object satisfying the `FeatureStore` interface
  instead of `@justjs/data`'s real
  `createFeatureStore()` — it only imports the *type*, never the runtime
  path.
- **Unnamed, not yet minimally isolated** — the `dataContext`-forwarding
  assignment above compiled correctly in every smaller isolated repro
  tried, yet was silently dropped somewhere in the full production bundle
  graph. Extracting it into a named function (matching the pattern that
  already fixed justjs#16's async-arrow bug) fixed it; the exact trigger
  condition in the larger graph was not tracked down given the time
  already spent — flagging this as a known gap in this investigation
  rather than a closed root cause.

All four remain open upstream in `justscript_compiler` (superseded below —
turned out three of them were never filed at all before being fixed, see
next section).

## All five `justc` bugs fixed upstream (justc 0.3.5, 2026-07-11)

`justscript_compiler` shipped 0.3.5 (commit `c3123fe`), fixing
justscript_compiler#3, #13, #14, and #16 directly (confirmed by re-running
each original repro and *executing* the output, not just recompiling it —
compiling clean was never the failure mode, these bugs only ever manifested
as a runtime `ReferenceError`/`TypeError`). #15 (aliased imports) shared the
same root cause as #16's bare-re-export-list handling and was fixed by the
same commit, confirmed the same way. The unfiled `dataContext`-forwarding
drop noted above no longer reproduces at all on 0.3.5 either.

Every workaround listed above and in justjs#16/#69/#70/#71's history has
since been **reverted** back to the natural code shape, and the whole
verification chain was re-run end-to-end on the same real Samsung SM-A055F
hardware with the reverted code and `justc` 0.3.5:

- `MountStep`'s `runtimeAdapter` and `DefaultCacheAdapter.set()`'s `ttl`
  are real parameter defaults again, not body-resolved workarounds
- `adaptCustomElementRegistry` uses an inline `async () => {}` passed
  directly to `registry.register()` again, and an inline
  `element.dataContext = dataContext` assignment again — no named-function
  extraction needed
- `@justjs/data`'s `signal.ts` aliases `@preact/signals-core`'s `signal`
  export again (`signal as preactSignal`)
- `js-runtime/main/features/mobile-bridge/tests/fixtures/app/src/app.ts`
  uses `@justjs/data`'s real `createFeatureStore()` again (not the
  hand-written stand-in), and
  `StoreProbeElement`'s `dataContext` setter uses a real chained
  `ctx?.store?.state.value.count` again (not the ternary workaround)

Full re-verification with all of the above reverted: real component mount,
CSS (`background-color: rgb(0, 123, 255)`, `padding-top: 8px`), state
setters (`disabled`/`aria-busy` attributes), a real synthesized click
producing a real `NotificationRecord`, and the real `@justjs/data`
`FeatureStore` driving `count: 0` → `count: 1` through a genuine
`@preact/signals-core`-backed re-render — all still correct.

**Minimum `justc` version for this package going forward: 0.3.5.**

## Native system UI verification (justjs#72, closed 2026-07-11)

Every prior verification used `notify()` — deliberately, since it has no
native UI of its own beyond posting a notification. `biometricAuth()` and
`camera()` are different: they trigger real native Android dialogs
(`BiometricPrompt`, a camera runtime-permission prompt) rendered *outside*
the WebView. `chromiumctl-cli` only sees the WebView's own DOM over CDP —
it cannot see or interact with either dialog. Verified with a human
physically present at the device to approve each prompt when triggered
(the other option considered, blind `adb shell input tap` coordinates, was
not needed since a person was available and gives a much more reliable
result).

Both commands wired as on-demand globals (`window.__triggerBiometricAuth`,
`window.__triggerCamera`, same pattern as justjs#71's
`__dispatchIncrement`) so they fire only when explicitly invoked via
`chromiumctl-cli eval`, not automatically on mount.

- **`biometricAuth()`**: triggered, a real system `BiometricPrompt` dialog
  appeared, approved by fingerprint/face on the device, `document.title`
  flipped to `"biometricAuth ok"` only after approval — confirming the
  full real chain (JS → `AndroidBridge` → JNI → Rust's multi-stage
  pipeline: `checkBiometricAvailability` → `checkSecureLockScreen` →
  `showBiometricPrompt`).
- **`camera()`**: triggered on a fresh install (permissions reset), a real
  camera runtime-permission dialog appeared and was granted, then a real
  `Camera2` still capture ran automatically (no shutter UI — the bridge
  captures directly). The resolved base64 was stashed on
  `window.__lastCameraBase64` and inspected directly, not just measured:
  it starts with `/9j/` (the fixed base64 encoding of JPEG's `FF D8 FF`
  magic bytes) followed by `RXhpZgAA` (base64 for the ASCII string
  `Exif\0\0`) — a genuine, valid JPEG with EXIF metadata, not just a
  non-empty string.

Both of `@justjs/platform-mobile`'s six real bridge commands
(`echo`/`notify`/`biometricAuth`/`contacts`/`camera`/`health`) now have at
least one real-hardware-verified representative from each class of
behavior this package can drive: no-UI (`notify`), native system dialog
(`biometricAuth`, `camera`), attribute mutation (justjs#70), and reactive
re-render (justjs#71). `contacts` and `health` remain unverified on real
hardware (no native dialog of their own, lower risk, not covered by this
issue's scope) if closing that gap ever becomes worthwhile.
