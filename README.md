# JustWeb framework

This repository is `sweengineeringlabs/justweb`, formerly `sweengineeringlabs/justjs`.
It contains the `@justjs/*` browser framework packages. The generator lives in
`sweengineeringlabs/machineweb`; the `justjs` CLI lives in `sweengineeringlabs/justweb-dev`.

## Current toolchain

| Component | Version | Source revision |
|---|---|---|
| MachineWeb generator (`mweb`) | 0.5.0 | `9035afa17bca513bcfd3e3081ae0fcba26df902e` |
| Project CLI (`justjs`) | 0.1.4 | `0445fffadd71f69504d35a909d178994b08685dc` |
| Bun | 1.4.2 | Pinned in `package.json` and CI |
| Rust for source builds | 1.99.1 | Pinned in CI |

All four generator examples use the exact `mweb` pin. The CLI installs a
checksum-verified binary and delegates generation and checking to it.
The `mweb` 0.5.0 release currently contains a Windows x86_64 binary only;
Linux CI builds the same pinned generator source.

Package names (`@justjs/*`), the `justjs` command, `[justweb]` configuration,
`justjs.config.toml`, `justweb.toml`, and artifact filenames retain their names.
The CLI supports legacy `justw` for generator pins before 0.5.0.

## Build and verify

```sh
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run test
bun run check:docs
```

With `justjs` v0.1.4 on PATH, run an example:

```sh
cd scm/examples/hello-justjs
justjs toolchain install
justjs toolchain list
justjs generate
justjs check
justjs typecheck
justjs build
justjs dev
```

Use `justjs --help`, `justjs generate --help`, and `justjs toolchain pin --help`
for the current CLI commands. To migrate an existing commented config, edit its
`[justweb]` version and revision to the table above, then install and regenerate.
`justjs toolchain pin mweb 0.5.0 9035afa17bca513bcfd3e3081ae0fcba26df902e` also
updates the pin, but rewrites TOML formatting and removes comments.

## Documentation

- [Architecture and pins](docs/3-design/architecture.md#pinned-toolchain)
- [Required generator contract](docs/3-design/justweb-compliance.md)
- [Toolchain update procedure](docs/7-operations/playbook.md#re-pin-the-toolchain)
- [Troubleshooting](docs/7-operations/runbook.md#pinned-toolchain-failures)
- [E2E validation and platform coverage](docs/e2e-validation.md)
- [External consumption](docs/external-consumption.md)

Local Windows validation against the sibling `justweb-dev` checkout passed
all four CLI and real Chrome workflows. The validation record distinguishes
those results from historical runs and hosted CI coverage.
