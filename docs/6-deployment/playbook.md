# Deployment Playbook — `@justjs/platform-mobile` on android-shell

How to go from `@justjs/*` source in this repo to a real justweb component
running inside `justscript_runtime`'s `android-shell` WebView. First executed
and verified end-to-end 2026-07-10 (real Samsung SM-A055F) — see justjs#16
and `platform/mobile/scm/main/README.md`'s "Real-hardware verification"
section for the full writeup.

This spans two repos. Each has its own docs for its own piece — this
playbook is the thing that ties `justjs`'s half together, not a replacement
for either:

- `sweengineeringlabs/justjs` (this repo) — the `@justjs/*` packages themselves
- `sweengineeringlabs/js-runtime` (repo dir: `justscript_runtime`) — `scm/app/` (the vendoring + entry script) and `scm/android-shell/` (the APK shell); see that repo's `docs/4-development/runbook/android-webview-verification.md` for the underlying `justc`/APK/`adb` toolchain this playbook builds on

## What CI covers, and what it doesn't (justjs#76)

Both repos have a `.github/workflows/ci.yml` that runs on every push/PR:

- **`justjs`**: `bun run build`/`typecheck`/`test`, plus
  `test:vendor-external` (justjs#40's integration test) — everything
  above that doesn't need a device or `justc`.
- **`js-runtime`**: a `justc build` compile-only check against
  `scm/app/src/app.ts` — catches a genuinely broken build, but **not**
  the class of bug that motivated justjs#16/#69-#72 (a bundler bug
  producing a runtime `ReferenceError` while `justc build` itself reports
  success).

Neither workflow touches a physical device. Everything below this line —
installing/launching an APK, `chromiumctl-cli`/`adb`-driven behavioral
verification (mount, CSS, click-to-notify, state setters, reactive
re-render, biometric/camera/contacts/health), the Android generator's
`javac`/`d8`/`aapt2` build steps, and all of `release-signing.md`'s
release-signed build verification — stays manual, following this
playbook and the [operations runbook](../7-operations/runbook.md). A
self-hosted, device-attached runner would be a separate, deliberate
follow-up, not something either workflow silently assumes.

## Prerequisites

| Requirement | Notes |
|---|---|
| This repo built | `bun install && bun run --filter '@justjs/application' build` (and `network`, `transport`, `platform-mobile` — see "Which packages to vendor" below) |
| `justc` | From `sweengineeringlabs/justscript_compiler`, **0.3.5 or later**. `justc --version` to confirm — see "Known compiler bugs" below if you're stuck on an older version |
| `js-runtime` checked out as a sibling directory | `../justscript_runtime` relative to this repo, matching `scm/app/build.sh`'s default `JUSTC` path assumption |
| Android SDK Build Tools + platform jar, `adb` | Same layout as `js-runtime`'s runbook and `appsoluxions`' deployment playbook assume: `C:\tools\android-sdk\android-14\{aapt2.exe,d8.bat,zipalign.exe,apksigner.bat}`, `C:\tools\android-sdk\android-34\android.jar`, `C:\tools\platform-tools\adb.exe` |

## Which packages to vendor

`js-runtime`'s `scm/app/` consumes `@justjs/*` as vendored `file:` tarballs
(see that repo's `scm/app/vendor/VENDOR.md` for *why* — no package registry
exists for these packages). Only what's actually imported at runtime needs
vendoring:

| Package | Needed because |
|---|---|
| `@justjs/network` | `@justjs/transport`'s `createFetchAdapter` dependency |
| `@justjs/transport` | `boot()`'s default `apiAdapter` construction |
| `@justjs/application` | `boot()`, `adaptCustomElementRegistry`, `DefaultRouter`, `DefaultLifecycle` |
| `@justjs/platform-mobile` | `createJsRuntimeShellAdapter()`, `createMobileBridge()` |
| `@justjs/data` | Only if the app actually calls `createFeatureStore()`/`createUIEventBus()` for real (ADR-0004 reactive re-render) — its own runtime dependency, `@preact/signals-core`, is a real public npm package and resolves normally via `npm install`, no extra vendoring needed for it |

`@justjs/application`'s own declared `dependencies` still include
`@justjs/data` in source, but since it's only ever reached via `import
type` inside `@justjs/application` itself (erased at compile time), strip
that entry from the packed `package.json` before `npm pack` — otherwise
`npm install` 404s trying to resolve it from the (nonexistent) public
registry, even in an app that never uses `@justjs/data` at all.

## Steps

### 1. Build and vendor

```sh
cd justjs
for pkg in network transport application platform/mobile data; do
  slug=$(basename "$pkg")
  bun run --filter "@justjs/$slug" build   # produces dist/ via tsc

  # dist/ is gitignored, so `npm pack` run in place would silently exclude
  # it (npm pack respects .gitignore) - stage dist/ + package.json in a
  # git-agnostic temp dir first, then pack from there.
  rm -rf "/tmp/$slug" && mkdir -p "/tmp/$slug"
  cp -r "$pkg/scm/main/dist" "/tmp/$slug/dist"
  cp "$pkg/scm/main/package.json" "/tmp/$slug/package.json"
done

# Strip @justjs/data from application's packed dependencies (see above)
# before packing it - edit /tmp/application/package.json by hand or with
# a one-liner, then:
for slug in network transport application platform-mobile data; do
  ( cd "/tmp/$slug" && npm pack --pack-destination ../../justscript_runtime/scm/app/vendor )
done
```

Update `scm/app/package.json`'s `dependencies`/`overrides` and
`vendor/VENDOR.md`'s pinned commit hash to match — see that file for the
exact shape (`file:` deps + `overrides` forcing nested `@justjs/*` names to
their own tarballs, since a packed tarball's own `workspace:*` metadata is
otherwise never resolved).

### 2. Write the entry script

The composition root (`app.ts`) imports each real component, calls
`@justjs/application`'s `boot()` with a `componentRegistry` (a
`LazyCustomElementRegistry`: tag → `() => Promise<CustomElementConstructor>`),
a `domAddressMap` (DDAS, `{ elements: { "<address>": { component, tag } } }`),
and `runtimeAdapter: createJsRuntimeShellAdapter()`, then calls
`justjs.router!.navigate(path)` to actually trigger mounting (`boot()` itself
only validates and constructs the runtime — it does not auto-navigate). The
DOM element `DefaultRouter` mounts into is resolved via
`document.querySelector('[data-ddas-id="<address>"]')` — the host HTML needs
a matching `data-ddas-id` attribute on the mount container.

#### Automated (justjs#81/#83, preferred)

```sh
node js-runtime/scm/generate-app-entry.mjs <path/to/registry.gen.ts> <output-dir> --app-name <name>
```

Parses a real, unmodified `registry.gen.ts` — `justw generate app`'s own
output, `DO NOT EDIT` header and all — for its `[tag, ComponentClass]`
list and each class's import path, and generates `<output-dir>/src/app.ts`
+ `<output-dir>/index.html`. Two modes, auto-detected by whether a real
`public/routes.gen.json` sits next to `registry.gen.ts` (justweb's real
layout for a `routes.yaml`-enabled project):

- **No `routes.yaml`** (mount-everything mode): one synthetic route +
  DDAS address + mount `<div>` per discovered component, `boot()` wired
  with all of them, one `navigate()` call per component at startup — so
  every component justweb generated actually ends up mounted, matching
  justweb's own "show everything, no routing" unrouted-app shape.
- **`routes.yaml` present** (routed mode, justjs#83): real per-route
  paths from `routes.gen.json`, one mount `<div>` per route, and a
  `navigateTo()` helper that shows only the current route's container and
  hides the rest — `RuntimeAdapter`'s `unmount()` is an intentional no-op
  for this WebView shell (see `js_runtime_shell_adapter.ts`), so nothing
  else would ever hide a previous route. justweb's own real routing
  output (`routes.gen.ts`/`component-registry.gen.ts`, ADR-0006/0008)
  can't be used directly — confirmed directly, not assumed: it
  lazy-loads each route via dynamic `import()`, which `justc`'s
  `--bundle --format iife` refuses to inline (`"unsupported
  configuration: dynamic import() requires --out-dir when --bundle is
  used"` — android-shell's bare WebView has no module loader to serve
  split chunks to). This mode reads `routes.gen.json`'s real path/tag
  *data* instead, generating the same eager, single-bundle-compatible
  imports the unrouted mode already used.

Either way, justweb's own repo/output is only ever read, never modified —
confirmed directly (`git status` on the justweb checkout stays clean
after running this).

This covers what's mechanically derivable from `registry.gen.ts` (+
`routes.gen.json`, when present) alone. It does **not** infer any
interaction logic beyond mounting/navigation (see `js-store-probe`/
click-handler logic in the manual example below — that kind of
app-specific behavior stays hand-written either way).

#### Manual (fallback for anything the automation doesn't cover)

See `js-runtime/scm/app/src/app.ts` for the hand-written reference example
(a real justweb `*_component.gen.ts` fixture wired end-to-end, plus real
interaction logic — click-to-notify, a `FeatureStore`-backed reactive
probe element, on-demand device-capability triggers — none of which a
mechanical `registry.gen.ts` → `app.ts` generator can infer). Use this
path directly for anything beyond what the automated generator covers, or
as a starting point to hand-edit after running the generator once.

#### Surviving Android process death (justjs#85)

`FeatureStore` state lives in the WebView's JS heap - if Android
recreates the Activity (rotation, now suppressed by `android:
configChanges` - see the generator's template) or genuinely kills a
backgrounded process, that heap and everything in it is gone by default.
Confirmed directly, not assumed: a real counter incremented to 5 came
back as 0 after nothing more than a device rotation, before the
`configChanges` fix.

For apps that use `FeatureStore` and need it to survive, apply the
convention `scm/app/src/app.ts` uses: read `window.JustjsState.load()`
(a real, synchronous `@JavascriptInterface` bridge -
`MainActivity.java`'s `JustjsStateBridge`, backed by `SharedPreferences`)
as `createFeatureStore()`'s initial state instead of a hardcoded default,
and call `window.JustjsState.save(JSON.stringify(state))` from
`store.subscribe()` on every change. This is app-level, not a
`@justjs/application`/`@justjs/data` API - `generate-app-entry.mjs`
doesn't wire `FeatureStore` into generated apps at all, so there's
nothing for the generator itself to automate yet. Verified on a real
device: incremented state, killed the actual process (`adb shell am
kill`, confirmed via `pidof` it was genuinely gone), relaunched, and the
state came back correctly - not simulated.

### 3. Compile via `justc`

```sh
cd js-runtime/scm/app
npm install   # picks up the vendored tarballs
../../../justscript_compiler/target/release/justc.exe build src/app.ts \
  -o app --target js --bundle --format iife --global-name JustRuntimeApp
```

`--format iife` matters — `android-shell`'s bare WebView loads
`<script src="app.js">` with no module-loader support.

**`justc` 0.3.5+ required.** Versions through `0.3.4` had five bundling
bugs (justscript_compiler#3, #13, #14, #15, #16) that all manifested as a
`ReferenceError`/`TypeError` at **runtime**, not a compile error — default
parameter values, inline async arrow function expressions, chained `?.`
expressions, and aliased/nested-package imports could all silently drop a
binding while `justc build` reported success. All five were fixed in
`0.3.5` (commit `c3123fe`) and confirmed by actually executing the
compiled output, not just recompiling it — see
`platform/mobile/scm/main/README.md`'s "All five `justc` bugs fixed
upstream" section for the verification detail. If you're on an older
`justc` and `document.title` (or similar) comes back
`"...boot failed - ReferenceError: <name> is not defined"` after install,
upgrade first before assuming the bug is in your own logic.

### 4. Package into the APK

```sh
cd js-runtime/scm/android-shell
export ANDROID_BUILD_TOOLS="C:/tools/android-sdk/android-14"
export ANDROID_JAR="C:/tools/android-sdk/android-34/android.jar"
export DEBUG_KEYSTORE="$HOME/.android/debug.keystore"
bash build.sh ../app/app.js --native-libs ../../main/features/mobile-bridge/jniLibs
```

`--native-libs` is optional — without it, the WebView still loads and
renders, but every `AndroidBridge.dispatchCommand` call returns
`{"ok":false,"error":"native bridge unavailable..."}` instead of running the
real Rust/JNI bridge. Omit it if you're only verifying component rendering,
not `@justjs/platform-mobile`'s device-capability facade.

`build/apk/app-signed.apk` is now installable — see the
[operations runbook](../7-operations/runbook.md#verify-justjsplatform-mobile-on-a-real-android-device)
for getting it onto a real device and confirming it actually rendered.

## Generating a full, independent Android app (justjs#74)

Step 4 above (`android-shell/build.sh`) packages a compiled `app.js` into
the one fixed, hand-maintained `android-shell` project — fine for
iterating on `@justjs/*` itself, but there was no way for a second,
independently-branded app (its own package name, its own permission set)
to exist without breaking `android-shell`'s build. `js-runtime` now has a
real generator for that: `scm/generate-android-app.sh` +
`scm/android-template/`. `android-shell` itself is this generator's first
real output (`scm/android-shell.manifest.json`), not a second, divergent
hand-maintained path — steps 1-3 above are unchanged, this replaces only
step 4.

```sh
cd js-runtime/scm
bash generate-android-app.sh <manifest.json> <output-dir> [--install]
```

Manifest shape (paths resolved relative to the manifest file's own
directory):

```json
{
  "packageName": "io.example.app",
  "displayName": "Example App",
  "versionCode": 1,
  "versionName": "1.0.0",
  "debuggable": true,
  "capabilities": ["notify", "biometricAuth", "contacts", "camera", "health"],
  "nativeLibs": "../../main/features/mobile-bridge/jniLibs",
  "icon": "../app/icon.png",
  "webApp": {
    "entry": "../app/src/app.ts",
    "css": ["../app/src/some_component.gen.css"],
    "html": "../app/index.html"
  }
}
```

`capabilities`, `nativeLibs`, and `icon` are all optional. `capabilities`
and `nativeLibs` drive which `<uses-permission>` entries
`AndroidManifest.xml` gets and which `Manifest.permission.*` values
`MainActivity`'s startup `requestPermissions()` call includes — an app
with no capabilities gets no runtime permission requests, and every
`dispatchCommand` call returns a graceful `"native bridge unavailable"`
error rather than crashing.

Seven capabilities exist today: `echo`/`notify`/`biometricAuth`/
`contacts`/`camera`/`health` (js-runtime#22/#27, wired via a dedicated
`match` arm each in `mobile-bridge/src/lib.rs`) and `location` (justjs#80,
wired via a `simple_capabilities` registration table instead — no-arg
capabilities that call one Java static method returning a JSON string,
which covers everything except `notify`/`biometricAuth`'s argument/
multi-stage shapes, register there without touching any of the six
`match` arms). The generator's own manifest/template rendering
(`render-template.mjs`) is fully data-driven — adding a capability never
requires changing it, only adding that capability's own `<!--CAP:x-->`/
`//CAP:x` blocks to the two Android templates.

`location` also has a typed `bridge.location(): Promise<LocationResult>`
method now (justjs#84) — `@justjs/platform-mobile`'s `MobileBridge`
interface doesn't automatically pick up `simple_capabilities`-registered
capabilities (justjs#80), so each one needs its typed method added by
hand; see that package's own README for the convention going forward.

`icon` (justjs#79) must be a single square PNG at least 192x192 —
upscaling a smaller source would ship a visibly blurry icon, so that's a
hard error at generation time, not a silent degrade. Real per-density
`mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}` resources are generated via
`android-template/generate-icon-resources.sh` (requires `ffmpeg` on
`PATH`). Omitting `icon` falls back to `android-template/default-icon.png`
— every generated app gets a real icon, never a blank one.

**Multiple independently-packaged apps can coexist on one device.**
`libmobile_bridge.so` used to resolve its native methods via JNI's static
`Java_<package>_<Class>_<method>` naming convention, which baked the
library to one specific package (`io.swelabs.jsruntime.shell`) at compile
time — a second app with a different package crashed with
`UnsatisfiedLinkError` the instant it called a native method. Fixed by
registering natives dynamically (`JNIEnv::register_native_methods()`
against a fixed bootstrap class, `io.swelabs.jsruntime.nativebridge.
NativeBridge`, called from `MainActivity`'s static init right after
`System.loadLibrary` succeeds) — every generated app compiles this same
bootstrap class in unchanged alongside its own `MainActivity`, so the same
`.so` works from any package. Confirmed on a real device: `android-shell`
(regenerated) and a second app with a different package and a different
capability subset install side-by-side (`adb shell pm list packages`
shows both) and both post real notifications through the same library
with no `UnsatisfiedLinkError`.

All three build scripts above (`build.sh`, `build-aab.sh`,
`generate-android-app.sh`) also support `--release`, for signing with a
real key instead of the debug one — see
[release-signing.md](release-signing.md) (justjs#75).
