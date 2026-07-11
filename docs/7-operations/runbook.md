# JustJS — Runbook

Day-to-day commands for working in this repository.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| bun | >= 1.0 | Package manager + script runner |
| Node.js | >= 20 | TypeScript compilation (tsc) |
| git | any | Source control |

---

## Setup

```bash
git clone <repo>
cd justjs
bun install
```

---

## Build

Packages have a strict build order — `@justjs/browser` imports type declarations
from `@justjs/core/dist`, so core must be built first.

```bash
# Build all packages in dependency order
bun run --filter '@justjs/core' build
bun run --filter '@justjs/browser' build

# Or build everything (order not guaranteed — use with care)
bun run build
```

Output lands in each package's `dist/` directory.

---

## Typecheck

```bash
# All packages
bun run typecheck

# Single package
bun run --filter '@justjs/core' typecheck
bun run --filter '@justjs/browser' typecheck
```

Both must exit `0` before any commit that touches `src/`.

---

## Test

> **Status:** test infrastructure is not yet set up.
> `@justjs/core` references jest in its test script but jest is not installed.
> Tracked in issue #2 (core implementations) — tests will be added alongside each implementation.

```bash
# Will run once tests are wired up
bun run test
```

---

## Clean build artifacts

```bash
# Remove dist/ from all packages
rm -rf packages/*/dist
```

---

## Add a dependency

```bash
# Dev dependency to a specific package
bun add -d <pkg> --cwd packages/core

# Runtime dependency
bun add <pkg> --cwd packages/browser
```

`@justjs/core` must remain at zero runtime dependencies — never add a runtime
dep there.

---

## Verify the workspace

After any structural change (new package, changed exports):

```bash
bun install          # re-resolve workspace links
bun run --filter '@justjs/core' build
bun run typecheck    # both packages must pass
```

---

## Common errors

### `Cannot find module '@justjs/core'`

`@justjs/browser` can't find core's type declarations. Build core first:

```bash
bun run --filter '@justjs/core' build
```

### `BootError: UNKNOWN_ROUTE`

An aspect's `on` or `except` array references a route path not present in
`routes.gen.json`. Check the path spelling — the error includes a "Did you
mean?" suggestion when the edit distance is ≤ 3.

### `BootError: UNKNOWN_COMPONENT`

Same as above but for a component tag name not present in `registry.gen.ts`.

### `BootError: UNKNOWN_STRATEGY`

An aspect's `strategy` name has no registered provider in the `AspectRegistry`.
Ensure the provider package is imported and self-registers before `JustJS.boot()`
is called.

---

## Verify `@justjs/platform-mobile` on a real Android device

Day-to-day commands for confirming a built `app-signed.apk` (see the
[deployment playbook](../6-deployment/playbook.md)) actually runs correctly
on real hardware — not just that it compiled. First run end-to-end
2026-07-10 on a real Samsung SM-A055F; see justjs#16 for the full history.

### Prerequisites

| Tool | Notes |
|---|---|
| `adb` | `C:\tools\platform-tools\adb.exe` in this ecosystem's usual layout — not necessarily on `PATH` |
| `chromiumctl-cli` built with the `android` feature | `cargo install --path chromiumctl --force --features android` from `sweengineeringlabs/chromiumctl`'s `scm/` directory. Without `--features android`, `--package` fails with `Error: --package requires building chromiumctl-cli with --features android` |
| A paired/connected device | See `appsoluxions/docs/7-operations/runbook.md` for first-time pairing (Developer options → Wireless debugging → pairing code) |

If `adb` isn't on `PATH`:

```sh
export ADB_PATH="/c/tools/platform-tools/adb.exe"    # Git Bash / sh
```

```powershell
$env:ADB_PATH = "C:\tools\platform-tools\adb.exe"
```

`chromiumctl-cli` reads the same `ADB_PATH`.

### Connect

```sh
"$ADB_PATH" devices -l
```

A device already paired from a previous session often reappears on its own
via mDNS auto-discovery (an `..._adb-tls-connect._tcp` entry) — try this
before re-pairing. If nothing shows up, pair fresh per the phone's
Wireless debugging screen:

```sh
"$ADB_PATH" pair <ip>:<pairing-port> <6-digit-code>
"$ADB_PATH" connect <ip>:<connect-port>   # different port than pairing - shown on the main Wireless debugging screen after a successful pair
```

### Install, launch, confirm the debug socket

```sh
"$ADB_PATH" install -r js-runtime/main/features/mobile-bridge/tests/android-shell/build/apk/app-signed.apk
"$ADB_PATH" shell am start -n io.swelabs.jsruntime.shell/.MainActivity
"$ADB_PATH" shell cat /proc/net/unix | grep webview_devtools_remote
```

The last command should show a `@webview_devtools_remote_<pid>` line. If it
doesn't, the app didn't launch, or debugging isn't enabled (it should be
already — `MainActivity.onCreate` calls
`WebView.setWebContentsDebuggingEnabled(true)` unconditionally).

### Evaluate against the real, live WebView

```sh
chromiumctl-cli eval --package io.swelabs.jsruntime.shell --script "document.title" --output json
```

A correct result echoes back whatever the compiled bundle actually set —
proof it executed inside the real WebView, not a desktop-Chrome
approximation. Useful follow-ups for confirming a specific component
actually mounted (adjust the tag/selector to match what you compiled in):

```sh
chromiumctl-cli eval --package io.swelabs.jsruntime.shell --script "document.querySelector('jsc-button').getAttribute('role')" --output json
chromiumctl-cli eval --package io.swelabs.jsruntime.shell --script "document.querySelector('jsc-button') instanceof customElements.get('jsc-button')" --output json
```

### Confirm a device-capability bridge call actually reached native code

Don't just trust the JS-side promise resolving — cross-check against real
device state. For `notify()`:

```sh
chromiumctl-cli eval --package io.swelabs.jsruntime.shell --script "document.querySelector('jsc-button').click(); 'clicked'" --output json
"$ADB_PATH" shell dumpsys notification --noredact | grep -A5 io.swelabs.jsruntime.shell
```

A real `NotificationRecord` for the app's package confirms the round trip
actually went `AndroidBridge.dispatchCommand` → JNI →
`main/features/mobile-bridge`'s Rust `dispatch()` → a real
`NotificationManager` call, not just that the JS `.then()` fired.

### Common errors

#### `Error: --package requires building chromiumctl-cli with --features android`

The installed `chromiumctl-cli` was built without the `android` cargo
feature. Rebuild per Prerequisites above.

#### `error: protocol fault (couldn't read status message): No error` from `adb pair`

The pairing code/port is single-use and short-lived. If the device already
shows up in `adb devices -l` via mDNS despite this, it's already
paired/connected from a prior session — the failed `pair` call is harmless
and can be ignored. Otherwise, regenerate a fresh pairing code on the phone
(close and reopen "Pair device with pairing code") and retry.

#### `"...boot failed - ReferenceError: <name> is not defined"` in `document.title`

Not a bug in your own component/config — see the deployment playbook's
"Known compiler bugs to watch for" section
(justscript_compiler#3 / #13).

#### `INSTALL_FAILED_VERIFICATION_FAILURE` on `adb install`

Samsung Auto Blocker (One UI 6+) blocks sideloaded installs by default.
Settings → Security and privacy → Auto Blocker → turn off, retry, then turn
it back on afterward — see `appsoluxions/docs/7-operations/runbook.md` for
the full writeup of this and other device-specific gotchas (two-`adb`-entry
handling via `ANDROID_SERIAL`, etc.).
