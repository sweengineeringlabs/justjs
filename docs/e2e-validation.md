# Addendum — 2026-10-17: justw 0.1.2 re-pin

- `justw` 0.1.2 @ `4d2828d47ac0a5eac50677efa835994dfdee18a9` pinned in all four examples (#163).
- CLI job checks out `justweb-dev` `5db7d42d2c62ce6053df5f2fb462693384c4816d` (bundled pin 0.1.2) (#164).
- Hosted CI (`test` on Linux, `cli-windows`) passed on #163 and #164 with those pins; manifests regenerated with no artifact changes.
- Not covered: macOS; justw 0.1.2 release is Windows x86_64 only.

# End-to-end validation — 2026-10-14

## Versions and scope

- Bun 1.4.2; local Windows host, real headless Chrome.
- `justjs` 0.1.1 from `justweb-dev` revision `c7e5ed7e9268c7884edc8938c9bb50d7a1caf629` (current main combined with the unmerged TOML 1.1 upgrade).
- `justw` 0.1.0 pinned to `64eb51bf4d471261053f6d08dac6db5ce613abd8` in all four examples.
- JustScript Compiler 0.3.10 for Android IIFE bundles.
- Changes and hosted evidence: [draft PR #160](https://github.com/sweengineeringlabs/justjs/pull/160).

## Results

| Check | Result |
|---|---|
| Frozen-lockfile install, workspace build/typecheck/tests | Pass |
| Four example Vite builds and Happy DOM checks | Pass; includes the 65-second memory-forgetting check |
| Pinned regeneration and artifact hashes | Pass; generated tracked artifacts unchanged |
| CLI install, repeated install, verified cache listing, generate | Pass for all four examples, invoked from `src/` |
| Native CLI build and project typecheck | Pass for all four examples |
| CLI `check` with Bun fallback (no `tsc` on PATH) | Pass for all four examples |
| CLI `check` with `tsc` on PATH | **Fails in pinned JustWeb** for all four examples; see below |
| Patched JustWeb checker, source revision `c4bde0b` | Passes `justw check` with TypeScript 5.5 on PATH for all four examples, including 45 generated AI editor files; upstream PR [#108](https://github.com/sweengineeringlabs/justweb/pull/108) merged as `cb304ad`, but no release contains the fix yet |
| Native CLI matrix with patched checker | Passes install twice, cache listing, generate, check, typecheck and build from nested `src/` in all four examples using a temporary cache seeded with the locally built checker and its digest; this proves CLI delegation, not the published pin |
| Real Chrome via `justjs dev` | Pass for all four examples; page/bundle requests, interactions, no runtime exceptions, servers stopped |
| Browser interactions | Counter/form validation; counter/login/logout; memory add/browse/settings; AI editor route mounts, SDLC navigation, editing and persistence |
| Layer/runtime boundaries | 17 dependency tests and 9 Node runtime tests pass; Vite and native CLI output contain no required native Bun APIs |
| Config → codegen → bundle integration | 3 tests pass; replaces the obsolete ConfigParser test |
| External consumer | Plain npm install and real Node execution pass, using Git Bash on Windows |
| Fresh CLI bootstrap/scaffold | Downloaded the draft Windows CLI asset, verified its SHA-256, then `new`, clean-cache toolchain install twice/list and build passed outside the workspace. Typecheck first hit an incomplete Bun `bunx` package cache; it passed after reinstalling TypeScript into that cache |
| Linux hosted CI | All checks pass in [run 38429859452](https://github.com/sweengineeringlabs/justjs/actions/runs/38429859452), including pinned-source regeneration and external consumption |
| Windows hosted CLI CI | In [run 38567701794](https://github.com/sweengineeringlabs/justjs/actions/runs/38567701794), all four Chrome flows pass; the CLI matrix still fails on the published `justw 0.1.0` pin |
| JustWeb hosted CI for checker fix | Could not start before or after merge: GitHub reports recent account payments failed or spending limit reached; local tests pass |
| Android IIFE compilation | Pass for cross-target-demo, agentic-memory-demo and ai-code-editor |
| Android APK packaging | Fresh debug-signed APKs build for all three mobile examples using just-mobile's generator |
| Android device execution | Pending: no physical device connected; installed API 34 Play Store AVD remains offline during attempted cold boot |

## Upstream checker and release status

`bun run check:cli-examples` makes the workspace TypeScript compiler available on PATH. The pinned generator calls `tsc --noEmit --skipLibCheck <generated files>`, which ignores the project's tsconfig. This loses the ES2022 target and `@browser/*` path mapping, producing TS18028 and TS2307 errors. A direct CLI invocation on the original shell instead used `bun build --no-bundle`, explaining the earlier successful check.

The independent `justjs typecheck` commands respect each project's config and pass. The checker fix now uses a temporary TypeScript project that extends the consumer config, includes ambient declaration files, and lists generated files only. Its regression suite passes locally, and the patched binary passes all four real examples. The upstream fix is in draft [justweb PR #108](https://github.com/sweengineeringlabs/justweb/pull/108); until it is merged and released, the examples' declared `justw` pin still uses the failing published binary. The JustJS command matrix therefore has not yet passed against the published pin.

The pinned release currently publishes a Windows binary only; Linux CLI download/install acceptance remains unfulfilled. Linux CI validates the pinned generator from source instead. The CLI TOML upgrade also remains unmerged upstream ([justweb-dev#22](https://github.com/sweengineeringlabs/justweb-dev/pull/22)).

## Reproduce

From the repository root, after installing the tested CLI revision:

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run test:e2e-tooling
bun run check:cli-examples
# The preceding command currently reports the four upstream check failures;
# it still executes and reports the remaining commands for each example.
bun run check:justweb-artifacts
bun scripts/ci/check-browser-runtime.ts --cli
bun run check:cli-browser
bun run test:vendor-external
```

Set `CHROME_PATH` if Chrome is not in a standard location. On Windows, put Git Bash's `bin` directory on PATH before external-consumption testing. Native CLI builds emit `dist-cli/`; run `justjs build` before the first `justjs dev`. Vite output remains in `dist/`.

The browser checks use local demo behavior. They do not make billed AI calls, provision cloud resources, or prove provider credentials and remote services work. SSR rendering of generated light-DOM components remains a separate open issue (#142).
