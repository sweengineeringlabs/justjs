# cross-target-demo

One composition root (`src/app.ts`), compiled unmodified for two targets:
a real browser (`vite build`) and Android (`justc build --bundle --format
iife`, via `js-runtime`'s generator). Proves the entire pipeline — all
four OSI layers (network/transport/application/data) and all six AOP
aspects (security/observability/i18n/flags/analytics/theming) — works
identically on both, through a real DDAS `router.navigate()` mount, not
a narrated version of it (unlike `scm/examples/hello-justjs`, which never
calls `navigate()` at all — see below).

## What's actually exercised

- **Application**: real `boot()` → `router.navigate()` → `MountStep` →
  `RenderStep` → `component_registry_adapter.ts`'s `render()`, which
  resolves a `data-ddas-id` placeholder already present in the host HTML
  and inserts the component into it. No `runtimeAdapter` is passed to
  `boot()` — the default `NoopRuntimeAdapter` is genuinely correct here;
  actual DOM insertion happens in `render()`, not in the adapter, on
  either platform (confirmed by reading `js_runtime_shell_adapter.ts`:
  its `mount()` is *also* a no-op).
- **Data**: a real `@justjs/data` `FeatureStore`, reactive re-render via
  the `set dataContext(ctx)` convention (same one `js-runtime`'s
  `StoreProbeElement` uses).
- **Network + Transport**: a real `justjs.apiAdapter!.get()` call (built
  by `boot()` from `@justjs/network`'s `createFetchAdapter()`), not a raw
  `fetch()` narrated as if it went through those layers.
- **All six AOP aspects**: registered and validated by `boot()`'s real
  `justjs.providers.has(concern, strategy)` gate — `boot()` throws a real
  `BootError` if a configured aspect strategy isn't registered.

## Two things found and fixed while building this

1. **justjs#91**: a bare side-effect import of any `@justjs/aop-*`
   package does not actually register its strategy — the SPI module that
   does (`src/spi/index.ts`) is compiled but not reachable through the
   package's `exports` map (only `.` → `dist/saf/index.js` is exported).
   Confirmed directly: `import "@justjs/aop-security"; justjs.providers.has("security","noop")`
   returns `false`. `hello-justjs`'s demo is very likely affected by this
   too and has probably been silently failing `boot()` since it was
   built — `app.gen.ts` wires the same aspects the same broken way.
   `src/app.ts` here works around it by importing each package's public
   `create*Provider()` factory and registering it manually.
2. **js-runtime's `AndroidManifest.xml.template` never declared
   `android.permission.INTERNET`** — no earlier app in the whole Android
   epic ever made a plain `fetch()` call from JS (every device capability
   goes through the native `AndroidBridge.dispatchCommand` JNI bridge
   instead, which doesn't need it). Fixed in both the template and
   `android-shell`'s hand-maintained manifest.

## A real-device testing gotcha (not a bug, worth knowing)

The first mobile fetch attempt failed with `TransportError: Failed to
fetch` even *after* the `INTERNET` permission fix. Root cause, confirmed
via `adb logcat`'s `NetdEventListenerService` and `dumpsys netpolicy`:
Android's Doze/App Standby power management was blocking background
network access for the app's UID (`blocked=DOZE|APP_BACKGROUND`) — and
the exact same block was hitting a real installed app (WhatsApp) at the
same moment, confirming it's a device-wide state, not anything specific
to this app. Fixed for testing by waking the screen
(`adb shell input keyevent KEYCODE_WAKEUP`) and bringing the app to real
foreground before retrying — no code or manifest change involved. Worth
remembering for any future real-device network verification: a
`chromiumctl-cli`-driven session doesn't necessarily keep Android's power
management convinced the app is genuinely foregrounded.

## Building

```sh
# Web
bun install
bun run build      # -> dist/, or `bun run dev` for a live server
node verify_web.mjs # real-DOM check via happy-dom - boots, mounts via
                     # DDAS, clicks increment, clicks fetch, checks results

# Mobile (from js-runtime's main/features/mobile-bridge/)
bash scripts/generate-android-app.sh \
  /path/to/justjs/scm/examples/cross-target-demo/android.manifest.json \
  <output-dir> --install
```
