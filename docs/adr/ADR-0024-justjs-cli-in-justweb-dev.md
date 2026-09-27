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
