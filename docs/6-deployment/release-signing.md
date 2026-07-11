# Android Release Signing (justjs#75)

`js-runtime`'s three Android build scripts (`android-shell/build.sh`,
`android-shell/build-aab.sh`, `scm/generate-android-app.sh` — see
[the deployment playbook](playbook.md)) all default to debug signing,
which is fine for sideloading onto a device you control via `adb` but
cannot be published to the Play Store or any real distribution channel.
`--release` signs with a real key instead, as an explicit opt-in that
never silently falls back to debug if the required credentials are
missing.

## 1. Generate a release keystore

```sh
keytool -genkeypair -v \
  -keystore /path/outside/either/repo/release.keystore \
  -alias <your-key-alias> -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "<keystore password>" -keypass "<key password>" \
  -dname "CN=Your Org, OU=Eng, O=Your Org, L=City, S=State, C=US"
```

**Note:** modern `keytool` defaults to PKCS12 keystores, which don't
support a separate key password — it silently reuses the keystore
password and warns `Different store and key passwords not supported for
PKCS12 KeyStores`. Set `RELEASE_KEY_PASS` to the same value as
`RELEASE_KEYSTORE_PASS` unless you specifically create a JKS-format
keystore instead (`-storetype JKS`).

Back up this file somewhere durable and outside both repos - Android
requires the **same** signing key for every update to an already-published
app. Losing it means you can never update that app again under its
existing package name (Play App Signing, if enabled at first upload, lets
Google hold the actual app-signing key and rotates your "upload key"
instead - out of scope here, since nothing in this ecosystem has
published to the Play Store yet).

## 2. Storage convention

**Keep the keystore file entirely outside both repos.** There is
currently no CI (justjs#76, not yet built) reading these credentials, so
"outside the repo" on your own machine (e.g.
`~/.android/release-<app>.keystore`, or a password manager's attachment
storage) is sufficient today. Both `.gitignore`s (`justscript_runtime/`
and `android-shell/`) also block common keystore extensions
(`*.keystore`, `*.jks`) as defense-in-depth, in case one ever lands inside
either repo by accident - that is a backstop, not the primary control.

All three scripts read the same four env vars, only when `--release` is
passed:

| Env var | Meaning |
|---|---|
| `RELEASE_KEYSTORE` | Path to the keystore file. Required. |
| `RELEASE_KEYSTORE_PASS` | The keystore password itself (not a file path). Required. |
| `RELEASE_KEY_ALIAS` | The signing key's alias inside the keystore. Required. |
| `RELEASE_KEY_PASS` | The private key's password itself. Required. |

Missing any of these fails loudly (`--release requires RELEASE_KEYSTORE
(path to your release keystore)`, etc.) - confirmed directly: running
`--release` with none of these set exits 1 with no APK/AAB produced, never
falling back to the debug keystore.

**The password *values* never appear as CLI arguments** - `apksigner` and
`jarsigner` both read them straight out of the named environment variable
(`--ks-pass env:RELEASE_KEYSTORE_PASS`, `-storepass:env
RELEASE_KEYSTORE_PASS`), so they never show up in `ps`/process-list
output. `bundletool` (only used by `build-aab.sh --install`, to turn the
signed `.aab` into installable device APKs) has no such `env:` option -
its `--ks-pass`/`--key-pass` only accept `pass:<value>` or
`file:<path>`), so for that one step the script writes the passwords to a
short-lived file instead of passing them inline, and deletes it via an
`EXIT` trap even if a later command fails.

## 3. Usage

```sh
# APK (android-shell/build.sh) or a generated app (generate-android-app.sh)
export RELEASE_KEYSTORE=/path/to/release.keystore
export RELEASE_KEYSTORE_PASS='...'
export RELEASE_KEY_ALIAS=your-alias
export RELEASE_KEY_PASS='...'
bash build.sh app.js --native-libs ../../main/features/mobile-bridge/jniLibs --release --install

# AAB (Play-Store-shaped artifact)
bash build-aab.sh app.js --native-libs ../../main/features/mobile-bridge/jniLibs --release --install
```

Omit `--release` (the default) to keep signing with the debug keystore,
exactly as before - no behavior change for existing callers.

## Verified

All four combinations (APK/AAB x debug/release), confirmed end-to-end on
a real Samsung SM-A055F, 2026-07-11:

- `apksigner verify --print-certs` / `jarsigner -verify -verbose -certs`
  on the release-signed outputs show the real release certificate's `CN`,
  not the debug one
- Each combination installs, mounts the real justweb component, and
  successfully calls through the JNI bridge (`notify()` -> a real Android
  notification) with no crash - the same functional check used throughout
  justjs#16/#69-#72/#74, now repeated across all four signing/packaging
  combinations rather than just the debug APK path

Along the way, this also caught and fixed a real regression left over
from justjs#74: `android-shell`'s hand-maintained `MainActivity.java` had
never been updated to call `NativeBridge.registerNatives()` (only the
generator's template had), so `build.sh`/`build-aab.sh` output crashed
with `UnsatisfiedLinkError` on launch whenever native libs were bundled -
independent of signing, but only surfaced by actually running these
builds on hardware rather than trusting that they still worked.
