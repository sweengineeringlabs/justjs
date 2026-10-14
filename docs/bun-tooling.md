# Bun tooling and runtime boundaries

Issue: [justjs#156](https://github.com/sweengineeringlabs/justjs/issues/156).

Use Bun **1.4.2** for development and CI. `packageManager` and the CI setup
pin that version; `engines.bun` sets 1.4.2 as the supported minimum for the
tested native API combination. This is a support floor, not a claim that
each API first appeared in 1.4.2. Node remains necessary for TypeScript and
the tests that verify unsupported-runtime diagnostics.

## Setup and verification

Install Bun 1.4.2 using the [official installation instructions](https://bun.com/docs/installation),
then run from the repository root:

```sh
bun --version                         # must report 1.4.2
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run test:tooling-layers
bun test scm/tests/tooling_runtime_int_test.ts
bun run check:justweb-artifacts
```

Build precedes tests because workspace SAF exports resolve to compiled
`dist` files. The shared `@justjs/html` package builds after application and
before its build/SSR consumers. CI checks the exact Bun version and uses a
frozen lockfile. A successful local run does not establish that hosted CI
passed; hosted regeneration also requires `JUSTWEB_READ_TOKEN`.

Example dev/build/preview scripts use `bun --bun vite` explicitly: invoking
`bun run dev` alone does not override Vite's Node shebang. Code generation
uses `bun run scripts/codegen.js`. Run an SSR entry point as `bun server.ts`.

## Providers and public contracts

| Public package | Contract | Registry concern | Shipped strategy |
|---|---|---|---|
| `@justjs/vite` | `TomlParser` | `tomlParser` | `bun` (default), `core` |
| `@justjs/build` | `ImportScanner` | `importScanner` | `bun` (default), `core` |
| `@justjs/html` | `HtmlEscaper` | `htmlEscaper` | `bun` (default), `core` |
| `@justjs/cloud-connect` | `ArchiveWriter` | `archiveWriter` | `core` |

Interfaces live in `api`, Bun implementations self-register from `spi`, and
consumers import factories/functions/types through SAF package exports.
SAF registers the dependency-free `core` implementations separately.
The providers use the existing `justjs.providers` registry. These are
tooling services, not woven aspects: select them at the tooling configuration
boundary, not in `boot({ aspects })`.

`createTomlParser`, `createImportScanner`, `createHtmlEscaper`, and
`createArchiveWriter` take a strategy name. Existing convenience functions
retain their defaults and accept an optional strategy:

```ts
import { runCodegen } from '@justjs/vite'
import { generateBundleResult } from '@justjs/build'
import { escapeHtml } from '@justjs/html'
import { createCloudConnectProvider } from '@justjs/cloud-connect'

await runCodegen('bun')
generateBundleResult(code, importmap, 'bun')
escapeHtml(text, 'bun')
createCloudConnectProvider('heroku', { token, archiveStrategy: 'core' })
```

`readConfig` and `watchAndCodegen` also accept the TOML strategy;
`renderComponent` accepts the HTML escaper strategy as its fifth argument.
Register an alternate implementation under another strategy and change only
the selected name. Node consumers can select the shipped `core` parser,
scanner, and escaper. The core parser supports the JustJS configuration TOML
subset; select `bun` when full TOML support is required.
Selecting `bun` without its required API throws an actionable error; importing
the package alone does not invoke Bun. Registry resets clear registrations,
as they do for existing providers; configure services before resetting state.

## Runtime audit

| Consumer | Runtime and boundary |
|---|---|
| hello-justjs code generation | Bun; imports `@justjs/vite` in `scripts/codegen.js` |
| All four Vite example commands | Bun host; emitted application code runs in browser/WebView |
| Build scanner and SSR renderer | Host-side tooling; Bun default provider, explicit alternate strategy required under Node |
| UI application source | No imports of the Vite/build/SSR/HTML tooling packages found in the audit; existing browser escaping stays browser-compatible |
| AI editor Heroku deployment | Browser/Android WebView; `core` archive provider uses USTAR plus `CompressionStream` |

Do not import native tooling into UI components. Example bundle checks reject
native Bun API references. Android application source shares the browser
composition root; actual device execution remains separate validation.

## Parsing, import scanning, and escaping behavior

[Bun TOML parsing](https://bun.com/docs/runtime/toml) preserves full values
containing `=`, comma-containing array strings, comments and nested tables.
Empty input yields an empty object; invalid TOML now throws instead of being
silently accepted by the old limited parser. Framework configuration and
JustWeb pin validation remain in code generation.

The [Bun transpiler](https://bun.com/docs/runtime/transpiler) uses the TypeScript
loader. The scanner returns sorted, deduplicated ES-module specifiers from
static imports, re-exports, and literal dynamic imports. It ignores paths
starting with `.`, type-only imports/exports, `require` calls, comments and
string contents. Nonliteral dynamic imports cannot be resolved statically
and are omitted. Absolute paths and URLs remain subject to the existing
import-map key validation. `validateTreeShaking` retains its public name for
compatibility but validates imports only; it does not prove dead-code removal.

[Bun HTML escaping](https://bun.com/docs/runtime/utils#bun-escapehtml) is shared
by build and SSR via `@justjs/html`. Apostrophes may now be `&#x27;` instead of
`&#39;`; these decode identically. Other HTML metacharacters, Unicode and empty
input are tested. This is HTML text/quoted-attribute escaping, not script-tag
or JavaScript sanitization. Existing raw HTML slot-content behavior is unchanged.

## Archive decision

[Bun.Archive](https://bun.com/docs/runtime/archive) can produce gzip-compressed
tar archives, the format used by the Heroku source upload flow. However,
the actual deployment consumer is the AI editor's browser/WebView application,
where Bun is unavailable. Retain the existing USTAR writer behind the `core`
strategy and do not add an unused Bun implementation with extra maintenance
and cross-runtime testing costs. A future host-side deployment consumer can
register another `ArchiveWriter` without changing the upload flow.

The retained writer emits regular files with UTF-8 contents, USTAR path
prefixes, mode 0644, uid/gid 0 and current mtime, then gzip-compresses with
the Web Platform API. Tests verify header fields/checksums, nested names and
contents; Bun.Archive is an independent decoder in tests only. This decision
does not establish Heroku upload CORS or credential validity.

## Example smoke checks and external prerequisites

Build each example with `bun run --filter '<name>' build`, then run from
that example directory:

| Example | Check | External prerequisites beyond the smoke check |
|---|---|---|
| hello-justjs | `bun verify_web.mjs` | Live fetch/backend operations require the configured backend |
| cross-target-demo | `bun verify_web.mjs` | Real API/auth operations require their configured services |
| agentic-memory-demo | `bun verify_web.mjs` | Dummy memory is local; live AI/image providers require configuration and credentials |
| ai-code-editor | `bun verify_mounts.mjs` | AI, cloud and other connector operations require provider credentials, backend/proxy access and applicable CORS support |

These scripts exercise built bundles in Happy DOM. They are not physical
browser/device or live-provider certification. Exact JustWeb artifact bytes
must remain LF; `.gitattributes` prevents Windows checkout conversion from
invalidating the generator's SHA-256 manifest.

After building all four examples, run `bun run check:browser-runtime` to
check emitted JavaScript for native Bun tooling APIs. CI runs this check
and `bun run test:tooling-layers` explicitly in addition to the build-time
dependency constraints.

Run `bun run test:e2e-tooling` for the real example config/codegen/bundle
pipeline. This replaces the obsolete `ConfigParser` test and runs in CI.
See [end-to-end validation](e2e-validation.md) for the current CLI/browser
results and remaining upstream checks.

## Local validation (2026-10-12)

On Windows with Bun 1.4.2, frozen-lockfile installation, workspace build,
typecheck and tests passed. All 17 dependency-constraint tests and nine
Node runtime tests passed, including the shipped `core` strategies. All four
examples built and passed their Happy DOM smoke checks; their 67 emitted
JavaScript chunks passed the browser runtime check. The four JustWeb artifact
manifests also passed validation. The optional long-running forgetting check
in the memory example was not enabled.

The separate external-consumption test failed before packaging: the local
`vendor-external.sh` checkout has CRLF line endings, which Bash rejects, and
the Windows `bash` command resolves to WSL without Node on PATH. This result
does not validate external packaging on Linux. `JUSTWEB_READ_TOKEN` is now
configured. The rerun of the previous main commit passed that check but
failed during JustWeb generator installation: the pinned checkout lacks
`scm/csslens/tester/scm/csslense/Cargo.toml`, a referenced Cargo workspace
member. Hosted validation of these tooling changes remains pending.
