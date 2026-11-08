# Changelog

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
