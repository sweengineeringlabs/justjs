# ADR-0024: justjs CLI lives in sweengineeringlabs/justweb-dev

**Status:** Accepted  
**Date:** 2026-09-26

## Context

justjs#158 originally proposed `sweengineeringlabs/justjs-cli` as a standalone Rust binary crate, mirroring the pattern of `justw` living in `sweengineeringlabs/justweb`. The CLI would be distributed separately from the framework repo.

During implementation it became clear that the CLI has hard runtime dependencies on `justw`, `csslense`, and `browsectl` — all of which are already built and versioned inside `sweengineeringlabs/justweb-dev`. Keeping the CLI in its own repo would require either:

- Publishing all three tool crates to crates.io (adds release coordination overhead), or
- Cross-repo workspace path dependencies (fragile, breaks `cargo install` from a single clone)

## Decision

The `justjs` Rust crate lives as a workspace member of `sweengineeringlabs/justweb-dev` alongside the tools it manages (`justw`, `csslense`, `browsectl`). There is no separate `justjs-cli` repo.

Install via:
```
cargo install --path justjs   # from the justweb-dev workspace root
```

A future GitHub Releases distribution step (curl-install script) is tracked separately. The binary produced is still a single self-contained executable.

## Consequences

- Single clone required to build or contribute to the CLI and its tools.
- `cargo install` from the workspace is the developer install path; no separate repo to maintain.
- GitHub Releases for `justjs` itself (the curl-install bootstrap story) remains open work — tracked in justjs#158 until that ships.

## Update (2026-11-05)

Two statements above no longer describe the project:

- **The tools are not built inside `justweb-dev`.** `justw`, `csslense` and `browsectl` are
  built and released from their own repositories (`sweengineeringlabs/justweb`, `csslense`
  and `browsectl`). The `justweb-dev` workspace holds the CLI and the crates that install and
  verify those releases (config, toolchain, release, and one provider per tool). The CLI
  downloads the pinned release of each tool; it does not compile them.
- **The CLI has releases.** `justjs` v0.1.2 is published from `justweb-dev` with binaries for
  Linux x86_64, macOS (x86_64 and arm64) and Windows x86_64, `SHA256SUMS` and an installer
  script. This repository's CI still builds the CLI from source at a pinned `justweb-dev`
  commit (see the pinned-toolchain section of the architecture document) rather than
  installing the release.

The decision itself, that the CLI crate lives in `justweb-dev`, is unchanged.
