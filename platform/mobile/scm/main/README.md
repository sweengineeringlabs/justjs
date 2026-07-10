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
  `js-runtime/scm/app/src/app.ts` uses a small hand-written object
  satisfying the `FeatureStore` interface instead of `@justjs/data`'s real
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

All four remain open upstream in `justscript_compiler`.
