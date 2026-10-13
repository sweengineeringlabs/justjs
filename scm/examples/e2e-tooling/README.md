# Tooling pipeline integration test

Run `bun run build`, then `bun run test:e2e-tooling` from the repository root.

The tests use hello-justjs's real TOML, import map, and pinned JustWeb artifacts. They verify package-alias resolution through code generation and import scanning, reject unresolved imports, validate every artifact hash, and bundle the actual HTML/application with Bun without Vite aliases.

Run `bun run check:cli-examples` and `bun run check:cli-browser` for complete CLI command and real Chrome checks. See [validation results](../../../docs/e2e-validation.md) for prerequisites and limitations. These tests do not establish SSR support for generated light-DOM components; that remains tracked separately in #142.
