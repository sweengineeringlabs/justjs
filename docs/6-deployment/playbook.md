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

`js-runtime/scm/app/src/app.ts` is the composition root — it imports a real
component, calls `@justjs/application`'s `boot()` with a `componentRegistry`
(a `LazyCustomElementRegistry`: tag → `() => Promise<CustomElementConstructor>`),
a `domAddressMap` (DDAS, `{ elements: { "<address>": { component, tag } } }`),
and `runtimeAdapter: createJsRuntimeShellAdapter()`, then calls
`justjs.router!.navigate(path)` to actually trigger mounting (`boot()` itself
only validates and constructs the runtime — it does not auto-navigate).

The DOM element `boot()`'s `DefaultRouter` mounts into is resolved via
`document.querySelector('[data-ddas-id="<address>"]')` — the host HTML
(`scm/app/index.html` and `scm/android-shell/assets/index.html`, which must
be kept in sync by hand; `build.sh` only copies `app.js`, not `index.html`)
needs a matching `data-ddas-id` attribute on the mount container.

See `js-runtime/scm/app/src/app.ts` for the current real example (a real
justweb `*_component.gen.ts` fixture wired end-to-end, not a hand-written
stand-in).

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
  "webApp": {
    "entry": "../app/src/app.ts",
    "css": ["../app/src/some_component.gen.css"],
    "html": "../app/index.html"
  }
}
```

`capabilities` and `nativeLibs` are both optional and drive which
`<uses-permission>` entries `AndroidManifest.xml` gets and which
`Manifest.permission.*` values `MainActivity`'s startup
`requestPermissions()` call includes — an app with no capabilities gets no
runtime permission requests, and every `dispatchCommand` call returns a
graceful `"native bridge unavailable"` error rather than crashing.

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
