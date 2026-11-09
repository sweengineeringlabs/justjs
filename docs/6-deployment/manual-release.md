# Manual framework releases

Framework repository tags identify snapshots independently of the versions in
individual package.json files. The packages are consumed through vendored tarballs,
not an npm registry. See [external consumption](../external-consumption.md).

For a manual release, verify the selected source revision, run the affected tests,
workspace/example typechecking, build, documentation and tooling checks. Fast-forward
all existing promotion branches to that revision, create an annotated repository tag,
and publish a GitHub Release without relying on hosted release automation.

Attach a source archive, a vendored archive containing the application and six AOP
packages with their complete internal dependency closure, a release manifest and
SHA256SUMS. Each npm tarball contains its package.json and clean compiled dist tree.
The included package-fragment.json supplies dependencies and overrides for external
consumers; unpack its vendor directory beside the consumer package.json. Tarball
package versions retain the source package versions. Record the repository tag and
revision when vendoring to distinguish snapshots.

The release manifest records the exact source revision, packaged versions and local
verification. Hosted CI, device tests and native platform execution must be described
separately from local TypeScript checks. A GitHub Release does not imply npm publication
or a new justjs CLI, generator or browser release.
