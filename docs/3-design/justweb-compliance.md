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
The public registry, lifecycle, router, and custom-element adapter factories
require an opaque capability returned by `validateJustWebRuntimeMetadata()`.
That validator checks the supported pin, manifest schema, canonical artifact
inventory, and DOM map digest used by boot, then freezes a snapshot. Passing
only a handwritten DOM map or a fabricated capability is rejected.
Framework-managed registration is restricted to tags in the validated map,
and a tag cannot be registered twice under that contract.

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

CI installs the pinned JustWeb generator, regenerates all four examples, and
fails if generation changes any checked-in output. It then verifies the
manifest digests and required generated files; local generation and boot
validation remain active when CI is not run.

## Application setup and migration

Install the pinned JustWeb CLI, keep the generated `public/justweb-artifacts.gen.json`
and `src/justweb-manifest.gen.ts` files with the app, then run the normal JustJS
code generation before starting Vite:

```sh
bun run codegen
bun run dev
```

The generated boot config supplies the contract to browser and Android startup;
neither path reads the source tree at runtime. Existing applications must add
`[justweb]`, regenerate all JustWeb output from a clean checkout at the pinned
revision, and pass the generated manifest and DOM address map through every
direct `boot()` or public lifecycle/router factory call. Configurations that
previously weakened DDAS enforcement must be updated to satisfy the mandatory
contract. Apps using external services must provide those service credentials
before exercising their flows.
