# Consuming `@justjs/*` from outside this workspace

`justjs` is a private bun workspace — its packages are never published to
any registry (justjs#40). Internal cross-package dependencies use real
semver ranges (`^0.1.0`), not `workspace:*`, but that alone doesn't help an
external consumer: `bun install` inside this workspace always resolves
`@justjs/application` to the local linked package, satisfying the range
without ever needing a registry — there is simply nowhere for a plain
`npm install @justjs/application` run *outside* this workspace to fetch
that package *from*.

**This is the supported way to consume `@justjs/*` packages from a project
that is not a member of this bun workspace.** No registry is required.

## Why not a git dependency?

`git+https://github.com/sweengineeringlabs/justjs.git#<commit>::path:<subdir>`
looks like it should work, but doesn't, at least not with plain `npm`
(confirmed by testing it directly): `npm`'s fetcher (`pacote`) parses the
`path:` subdirectory suffix but never actually uses it to scope the
checkout — it always clones and attempts to `npm install` the *entire*
repo root, which has 20 workspace members, several of which declare
`workspace:*`-adjacent dependencies plain `npm` can't resolve
(`EUNSUPPORTEDPROTOCOL: Unsupported URL Type "workspace:"`).

## How it works instead

`scm/vendor-external.sh` packages one or more `@justjs/*` workspace
members — plus their **full transitive `@justjs/*`/`@justscript/*`
dependency closure**, resolved automatically from each package's own
`package.json` `dependencies` — into real, installable npm tarballs via
`npm pack`, and emits a ready-to-use `dependencies`/`overrides` JSON
fragment.

```sh
scm/vendor-external.sh <output-dir> <package-name> [package-name ...]
```

Example — vendoring `@justjs/application` and `@justjs/platform-mobile`
for a consumer project:

```sh
cd justjs
scm/vendor-external.sh /path/to/your-app/vendor @justjs/application @justjs/platform-mobile
```

This produces, in `/path/to/your-app/vendor/`:

- `justjs-<slug>-<version>.tgz` — one real tarball per package in the
  closure (in the example above: `application`, `platform-mobile`, and
  their own transitive deps — `transport`, `network`, `data` — resolved
  automatically, not something you need to enumerate by hand)
- `package-fragment.json` — a `{ "dependencies": {...}, "overrides": {...}
  }` snippet, ready to merge into your own `package.json`

Merge the fragment into your `package.json` (adjust the `vendor/` path if
you keep the tarballs somewhere else relative to your `package.json`), then:

```sh
npm install
```

`overrides` is required, not optional — it's what forces every nested
`@justjs/*` dependency declared *inside* the vendored packages themselves
(e.g. `@justjs/application`'s own `"@justjs/transport": "^0.1.0"`) to
resolve to the same local tarball instead of attempting a real registry
lookup that would 404. `overrides` replaces the declared range
unconditionally, so those internal semver ranges are never actually
validated against the vendored tarball's version — keep the vendored set
in sync (re-run the script) rather than hand-editing versions apart.

## Why the full transitive closure, always

An earlier, hand-run version of this process (documented in
`sweengineeringlabs/js-runtime`'s `scm/app/vendor/VENDOR.md` before this
script existed) required manually deciding whether to strip an
unused-but-declared dependency from a packed `package.json` — e.g.
`@justjs/application` declares `@justjs/data` as a dependency, but a
consumer whose code only ever reaches it via `import type` doesn't need it
at runtime, and packing it unmodified would make plain `npm install` 404
trying to resolve `@justjs/data` from the (nonexistent) public registry.

This script sidesteps that judgment call entirely: it always vendors every
package in the full closure, whether or not your specific code happens to
use all of it. An unused-but-vendored tarball is harmless; a
missing-but-required one is a 404. Simpler and strictly safer than
deciding per-consumer which edges of the graph are "really" needed.

## Re-vendoring after an update

Pin to a specific `justjs` commit by checking it out locally and re-running
the script from that checkout — there is no version-range mechanism for
"the latest published `@justjs/application`" the way a real registry would
give you, since there is no registry. Note the commit hash you vendored
from somewhere in your own project (see
`sweengineeringlabs/js-runtime`'s `scm/app/vendor/VENDOR.md` for the
convention this repo itself uses to do that).

## Verifying this yourself

`scm/vendor-external.sh` is exercised by a real integration test
(`scm/tests/vendor_external_int_test.ts`, run with
`bun run test:vendor-external` from the repo root — see that file for
exactly what it checks) that runs the script against a genuinely fresh
temporary directory, `npm install`s the result with no `bun`/`workspace:*`
involved, and confirms the imported package's real code executes
correctly — not just that the import resolves. That's the same check this
doc's instructions were verified against before being written down.
