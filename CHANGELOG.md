# Changelog

## v0.35.0 — 2026-11-09

- Merged the API naming refactor into the current framework: application API files
  use `api_*.ts`, and six AOP provider interfaces use `api_provider.ts`. Updated
  internal imports while preserving current runtime implementations and public
  package exports. Integration test filenames use the existing `_int_test` convention.
- Includes the repository rename, pinned-toolchain documentation and mweb 0.5.0
  integration changes since repository tag v0.34.0.
- Manual GitHub release with source and vendored package archives. Repository tags
  identify framework snapshots; package.json versions retain their existing values.
  No packages are published to an npm registry. See
  [manual releases](docs/6-deployment/manual-release.md).

## 2026-11-08

- Migrated framework generator contracts, four example pins and generated artifacts,
  and CI from legacy `justw` 0.1.2 to `mweb` 0.5.0. Verified locally end to end
  alongside `justweb-dev` v0.1.4.

- Renamed the framework repository from `sweengineeringlabs/justjs` to
  `sweengineeringlabs/justweb` (#169). The former GitHub URL redirects to this repository.
- The generator repository is `sweengineeringlabs/machineweb`. Consumers that used
  `sweengineeringlabs/justweb` for the generator must use `machineweb` directly.
- This repository rename preserves `@justjs/*` package names, the `justjs` CLI command,
  and `justjs.config.toml`. Do not recreate a repository at the old `justjs` name;
  reusing that name would break its redirect.
