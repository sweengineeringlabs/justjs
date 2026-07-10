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

## Prerequisites

| Requirement | Notes |
|---|---|
| This repo built | `bun install && bun run --filter '@justjs/application' build` (and `network`, `transport`, `platform-mobile` — see "Which packages to vendor" below) |
| `justc` | From `sweengineeringlabs/justscript_compiler`. `justc --version` to confirm — this playbook's fixes assume `0.3.4`; check justscript_compiler#3 and #13 for open bundler bugs that affect any consumer, not just this one |
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

`@justjs/data` is **not** vendored — `@justjs/application`'s `boot()` path
used here only reaches it via `import type` (`FeatureStore`/`UIEventBus`),
erased at compile time. Its declared `dependencies` entry in the packed
`package.json` must be stripped before `npm pack`, or `npm install` 404s
trying to resolve it from the (nonexistent) public registry.

## Steps

### 1. Build and vendor

```sh
cd justjs
for pkg in network transport application platform/mobile; do
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
for slug in network transport application platform-mobile; do
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

**Known compiler bugs to watch for** (justscript_compiler#3, #13 — both
confirmed still open as of `0.3.4`): any function/method/constructor
parameter with a default-value expression (`x: T = expr`) gets dropped from
the emitted signature under `--bundle --format iife`/`cjs`, and an inline
`async () => {}` arrow function expression passed as a call argument loses
its `async` modifier the same way. Both manifest as a `ReferenceError` at
**runtime**, not a compile error — `justc build` succeeds and produces a
bundle that throws the first time the affected code path actually runs. If
`document.title` (or similar) comes back
`"...boot failed - ReferenceError: <name> is not defined"` after install,
suspect this class of bug first and grep the compiled `app.js` for the
offending constructor/function before assuming the bug is in your own logic.
Workaround: resolve the default inside the function body (`x ?? fallback`)
instead of in the parameter list; extract an inline async arrow into a named
`async function` declaration.

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
