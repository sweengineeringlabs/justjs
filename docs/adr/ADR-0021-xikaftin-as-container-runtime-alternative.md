# ADR-0021: Xikaftin as an alternative to Docker in EC2's Container-image deploy mode (proposal)

- **Status:** Proposed — not yet accepted, the open question below needs
  resolution before implementation starts
- **Date:** 2026-07-26

## Summary

ADR-0020's "Container image" deploy mode generates a script that
installs Docker (`dnf install -y docker`) and runs a container on a
fresh EC2 instance. `sweengineeringlabs/virtualization/xikaftin` is a
real, separate project (this session's discovery, not previously known
to this ADR set) - a full OCI-compliant container runtime written in
Rust, with its own `xika` CLI. This proposes whether it should replace
Docker as that mode's target, or as a second selectable target.

## What Xikaftin actually is (verified by reading its own source/docs, not assumed)

- A real, non-trivial project: cross-platform (Linux/Windows/WSL2/
  macOS) container lifecycle management, a CRI gRPC server for
  Kubernetes integration, and a BuildKit-style Dockerfile build engine -
  organized as ~30 crates following this ecosystem's own SEA
  (api/core/saf) pattern.
- Its `xika` CLI has a real `run` command
  (`oci-runtime/main/cli/src/commands/run.rs`) accepting `--name`,
  `--ports`, `--volumes`, `--env`, `--network` - conceptually close
  enough to `docker run -d --name <n> -p <port>:<port> <image>` that a
  template swap is plausible, not a stretch.
- Its own CLI code still has a `MockPlatform` fallback path alongside
  the real native one (`run.rs`'s own `mock_platform` parameter) - a
  signal the real, every-platform path isn't necessarily fully hardened
  yet, not confirmed one way or the other from a source read alone.
- **`xika run` is daemonless** - confirmed by reading `run.rs`: it
  constructs `gateway::create_manager(native(), root)` and calls
  `manager.run(...)` inline, no client/server round trip. `serve`
  (`commands/serve.rs`) is a separate, optional mode that only starts a
  Kubernetes CRI gRPC server - not a prerequisite for plain `run`. This
  means an EC2 boot script targeting Xikaftin would actually be
  *simpler* than the Docker one - no `systemctl enable --now` daemon-
  startup step at all, just fetch the binary and call `xika run`
  directly.

## If both real blockers above were resolved, would adoption be possible?

Plausible, grounded in what's actually verified so far - not yet
confirmed by building and live-testing it, which is the real difference
between "plausible" and "verified" this project holds every other
integration to:

- The CLI surface (`--name`/`--ports`/`--volumes`/`--env`) already maps
  closely enough to the existing Docker template's shape.
- EC2 instances are plain Linux, and Xikaftin's own architecture has a
  real platform implementation for Linux specifically (namespaces,
  cgroups, overlayfs, CNI networking per its own README) - the same
  class of kernel primitives Docker itself is built on. Nothing about
  EC2-as-a-hosting-environment is Docker-specific.
- Being daemonless removes a whole class of "is the daemon running/
  healthy" failure mode the Docker template has to account for.

**Live-tested this session, on Windows only - real, mixed result.**
Built `xika.exe` in release mode from source (real build, ~26 crates,
confirmed via active `rustc`/`cargo` processes and a produced binary,
not assumed). Ran `xika run --name test-alpine alpine:latest -- echo hello`:

- **Real success**: the full image-pull pipeline is genuine, not
  mocked - real manifest resolution against Docker Hub, real
  architecture detection (`amd64`), a real 3.8MB layer download, real
  extraction, `PullComplete`.
- **Real failure**: container creation itself then failed -
  `Error: platform error: process error: invalid network id`. Root-
  caused, not left as a mystery: this machine is **Windows 11 Home
  Single Language** (confirmed via `Get-ComputerInfo`), which does not
  support the Windows `Containers` optional feature at all (Pro/
  Enterprise/Server-only) - `Get-HnsNetwork` returns zero networks
  because none can exist here. Xikaftin's HNS-based networking setup on
  Windows has nothing to reference, hence the error.

**This is a real limitation of the test machine, not evidence against
Xikaftin itself, and it doesn't answer the question that actually
matters for this ADR.** EC2 instances are Linux, and Xikaftin's Linux
path uses CNI networking - a different, more mature code path per its
own README, not the HNS one that just failed here. No Linux test
environment was available this session to verify that path the same
way - **the Linux/EC2-relevant path remains genuinely unverified**, not
just "probably fine by analogy." A real next step, if this ADR
continues, is running this same `xika run` test on an actual Linux box
(or a real EC2 instance) before treating the runtime as viable for
ADR-0020's use case.

**Live-tested this session, on real Linux (WSL2 Ubuntu 24.04, kernel
`6.6.87.2-microsoft-standard-WSL2` - a genuine Linux kernel, not WSL1's
translation layer), per direct instruction to verify the actually-
relevant path. Real, negative result: the Linux platform code does not
compile as checked into the repo.**

After building from source a second time (three real, sequential
environment issues fixed first - a private vendored cargo registry
needing a path rewrite, plus two missing sibling path-dependency
directories, `oci-image` and `image-registry`/`xtask` - and one real
false start where the registry-index git repo's committed `HEAD` still
held the old Windows-native path even after editing the working-tree
file, because cargo's git-registry fetch reads from the commit, not an
uncommitted edit), `cargo build --release --bin xika` fails with three
real compile errors, all in `main/features/platform`'s Linux code:

- `nix::unistd::sethostname` and `nix::unistd::pivot_root` - both
  "configured out" per rustc's own error, because the workspace root
  `Cargo.toml` pins `nix = { version = "0.29", features = ["sched",
  "mount", "signal"] }` - the `"hostname"` and `"fs"` features that
  gate those two functions in `nix` 0.29 are simply not enabled.
  Confirmed via `Cargo.lock` that `nix` itself resolved to exactly the
  pinned `0.29` - not a version-resolution accident, a real missing
  feature flag in the manifest.
- `setup_networking`/`teardown_networking` (`core/linux/mod.rs:253,269`)
  - "no method found for opaque type `impl NetworkManagerApi`" - the
  trait defining both methods (`networking::NetworkManagerApi`) is
  implemented but never imported into that file's scope.

**This is a materially different finding than the Windows result.**
The Windows failure was this specific test machine's own limitation
(Windows 11 Home lacking the `Containers` feature) - not a defect in
Xikaftin. This one is not environment-specific: it's a real defect in
the checked-in Linux platform code itself, on a genuine, standard
Ubuntu 24.04 + `rustup`-installed toolchain, the same class of
environment a real EC2 instance's build (if one were ever attempted)
would use. **The Linux/CNI path - the actual precondition for adopting
Xikaftin in ADR-0020's use case - cannot currently be exercised at all,
because the code housing it does not build.** No code changes were
made to Xikaftin's own repository to work around this - it's a
separate project this ADR only reads and tests, not one this session
has any standing to patch.

## The real blocker - not capability, distribution

`dnf install -y docker` works in ADR-0020's generated script because
Docker CE has a public, hosted package repository - any fresh Amazon
Linux instance can fetch it in seconds, no prior setup. Xikaftin has
**no public binary release channel found** (no GitHub releases, no
package repo, nothing this session could locate) - there is currently
nothing a freshly-launched EC2 instance's boot script could `curl`/
`dnf install` to obtain the `xika` binary. Building it from source on
every launched instance is not realistic for a boot script (real Rust
compile time, plus needing a full toolchain on what's supposed to be a
minimal app-hosting instance).

This is the actual reason this isn't a same-day drop-in swap - not the
CLI shape, which is close enough already.

## Open question (needs resolution before implementation starts)

**Is a real, hosted `xika` binary release something this project wants
to stand up** (own S3 bucket, GitHub releases, or similar), specifically
to make it fetchable from a fresh EC2 instance's boot script? This is a
real decision with real ongoing cost (someone has to build and publish
release artifacts for however many platforms/architectures EC2 actually
launches - realistically just `x86_64`/`aarch64` Linux, not the full
Windows/WSL2/macOS surface `xikaftin` also targets), not something this
ADR can default on Xikaftin's own maintainers' behalf.

- **If yes**: this becomes a real, scoped follow-up - add a "Container
  runtime" choice (Docker / Xikaftin) to ADR-0020's Container-image
  mode, generating the appropriate install-and-run script for whichever
  is picked. The `xika run` flag surface would need one real,
  live-verified translation from the existing Docker-shaped structured
  fields (image/port) - the same rigor ADR-0020's own templates were
  held to.
- **If no**: Docker remains the only Container-image target. Worth
  revisiting this ADR later if Xikaftin gains real, hosted releases
  independent of this decision.

## Scope

### Deliberately not decided here

- Whether to publish Xikaftin release artifacts at all - that's a real
  decision about the Xikaftin project itself, not something a justjs
  ADR should make on its behalf.
- Which platforms/architectures a hypothetical release would cover.

### If pursued (contingent on the open question above)

- A runtime choice added to the Container-image mode's structured
  fields (Docker, the ADR-0020 default; Xikaftin, opt-in).
- `core/ec2_deploy_templates.ts` gains Xikaftin-targeted generators
  mirroring the existing Docker ones, fetching the real published
  release artifact instead of a package-manager install.
- Real live verification of the generated `xika run` invocation against
  an actual instance - the same bar ADR-0020's Docker templates were
  verified to (a real command that actually starts a real container,
  not just a plausible-looking CLI invocation).

### Permanently out of scope regardless

- Building Xikaftin from source as part of an EC2 boot script - real
  compile time makes this impractical for what's supposed to be a fast
  instance launch.
- Any platform beyond Linux x86_64/aarch64 for this specific use case -
  EC2 instances are Linux; Xikaftin's own Windows/WSL2/macOS support is
  real but irrelevant to this particular integration point.

## Acceptance criteria (for this ADR's own resolution, not implementation)

- [ ] A real decision recorded on whether a hosted `xika` release is
      worth standing up for this purpose
- [ ] If yes: which platforms/architectures, and where they'd be hosted
- [x] Built and live-tested `xika run` once this session, Windows only -
      real pull pipeline confirmed working, real container-start failure
      root-caused to this machine's Windows 11 Home edition lacking the
      `Containers` optional feature (not a Xikaftin defect)
- [x] The actually-relevant path for this ADR - `xika run` on real Linux
      (EC2's real platform) - tested this session on real WSL2 Ubuntu
      24.04. Result: **does not build.** Three real compile errors in
      `main/features/platform`'s Linux code (two `nix` crate feature
      flags missing from the workspace manifest, one missing trait
      import) - a genuine defect in the checked-in code, not an
      environment limitation. This is a hard blocker on adoption until
      fixed upstream in Xikaftin itself, independent of the
      distribution/hosted-release question below.

## Relates to

- [ADR-0020](ADR-0020-ec2-git-and-container-deploy-templates.md) - the
  Container-image deploy mode this proposes adding a second runtime
  target to
- `sweengineeringlabs/virtualization/xikaftin` - the project itself,
  read directly (READMEs + `run.rs` source) to ground this ADR's claims,
  not assumed from its name alone
