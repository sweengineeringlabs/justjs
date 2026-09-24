# Mandatory JustWeb compliance (#157)

JustWeb compliance is a framework requirement, not a CI option. The rollout
is breaking and is tracked in https://github.com/sweengineeringlabs/justjs/issues/157.

## Mandatory DDAS validation

Boot requires a valid DOM address map for registered components and validates
every registered tag before creating aspects or the runtime. There is no
enforcement setting, compatibility mode, or warning-only path.

## Required generator contract

Every boot requires a versioned JustWeb artifact manifest from `justw 0.1.0`.
Every `justjs.config.toml` also requires a `[justweb]` section that pins that
version, an exact 40-character generator revision, artifact schema `1`, and the
manifest path `public/justweb-artifacts.gen.json`. The framework owns the
supported version and schema policy; applications can only pin an exact build
within that policy.
The Vite code generator requires a clean generator source revision, checks every
listed artifact against its SHA-256 digest, and embeds the manifest into the
generated boot config. Boot validates the manifest shape, generator revision,
required generated registries, route artifacts, and the supplied DOM map digest
before constructing aspects or runtime state. Applications that call `justjs.boot`
directly must provide the same generated manifest and DOM map.
The public `createComponentRegistry(domAddressMap)`, `createLifecycle(domAddressMap)`,
and `createRouter(..., domAddressMap)` factories require the generated map too;
framework-managed registration is rejected when a tag is absent from that map.

The JustWeb producer emits the manifest after all generation steps and records
the generator revision and whether its source checkout was dirty. The source
change is tracked upstream in
https://github.com/sweengineeringlabs/justweb/issues/106. A dirty-source
manifest is rejected, so artifacts must be regenerated using a clean build of
the pinned generator before an application can boot.

The manifest currently establishes consistency, not authenticated authorship.
Hashes and version declarations cannot prove who produced an artifact; signed
attestation would require a separate trusted-verifier design.

## Trust boundary

Version declarations and artifact hashes detect inconsistency; neither proves
who produced an artifact. Authenticated origin would require a separately
designed signing/attestation system and trusted verifier. No such guarantee is
claimed by structural contract validation. Enforcement governs supported JustJS
APIs, not modified framework forks or raw DOM calls outside the framework.

CI runs `bun run check:justweb-artifacts` for all four examples. This verifies
the checked-in manifest digests and required generated files; local generation
and boot validation remain active when CI is not run.
