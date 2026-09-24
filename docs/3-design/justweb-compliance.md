# Mandatory JustWeb compliance (#157)

JustWeb compliance is a framework requirement, not a CI option. The rollout
is breaking and is tracked in https://github.com/sweengineeringlabs/justjs/issues/157.

## Mandatory DDAS validation

Boot requires a valid DOM address map for registered components and validates
every registered tag before creating aspects or the runtime. There is no
enforcement setting, compatibility mode, or warning-only path.

## Remaining contract work

Removing overrides does not establish generator provenance or complete #157.
The required `[justweb]` declaration, versioned artifact manifest, generator pin,
artifact validation, public factory enforcement, and example migration are still
pending. An empty application can still boot without generator metadata until
that required-contract change lands; this is not full JustWeb enforcement yet.

The producer contract must be implemented in JustWeb before generated fixtures
can honestly claim to satisfy it. Its existing DOM-map SHA-256 sidecar is useful
but does not cover all generated components, registries, and routes or establish
the generator identity. Do not manufacture producer metadata in a consumer test
and describe that as an end-to-end generation test.

## Trust boundary

Version declarations and artifact hashes detect inconsistency; neither proves
who produced an artifact. Authenticated origin would require a separately
designed signing/attestation system and trusted verifier. No such guarantee is
claimed by structural contract validation. Enforcement governs supported JustJS
APIs, not modified framework forks or raw DOM calls outside the framework.
