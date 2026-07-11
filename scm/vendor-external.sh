#!/usr/bin/env bash
# Packages one or more @justjs/* workspace members (plus their full
# transitive @justjs/*/@justscript/* dependency closure) into installable
# npm tarballs, for a consumer outside this bun workspace where plain `npm`
# has no way to resolve `workspace:*`/local packages (justjs#40 - this repo
# has no published registry).
#
# This formalizes what
# js-runtime/main/features/mobile-bridge/tests/fixtures/app/vendor/VENDOR.md
# documented by
# hand (npm pack + `overrides` forcing nested @justjs/* ranges to local
# tarballs) into a real, repeatable script - the previous version required
# manually deciding whether to strip an unused-but-declared dependency
# (e.g. @justjs/data from @justjs/application when a consumer's code only
# reached it via `import type`) to dodge an npm 404. This script sidesteps
# that entirely: it always vendors the full closure of every @justjs/*
# package a requested root actually declares as a dependency, so nothing
# ever needs stripping - an unused-but-vendored tarball is harmless.
#
# Usage:
#   scm/vendor-external.sh <output-dir> <package-name> [package-name ...]
#
# Example:
#   scm/vendor-external.sh /path/to/consumer/vendor @justjs/application @justjs/platform-mobile
#
# Produces in <output-dir>:
#   justjs-<slug>-<version>.tgz   - one tarball per package in the closure
#   package-fragment.json         - a { "dependencies": {...}, "overrides": {...} }
#                                   snippet ready to merge into the consumer's
#                                   own package.json (see that file's own
#                                   comment for exactly how)
set -euo pipefail

usage() {
  echo "Usage: $0 <output-dir> <package-name> [package-name ...]" >&2
  echo "Example: $0 ./vendor @justjs/application @justjs/platform-mobile" >&2
  exit 1
}

[ $# -ge 2 ] || usage
OUTPUT_DIR="$1"
shift
ROOTS=("$@")

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "==> discovering workspace members"
# Reads the root package.json's own "workspaces" array - the same list
# `bun install` already uses - rather than a separately-maintained mapping
# that could drift out of sync with it.
WORKSPACE_DIRS=$(node -e '
  const pkg = require("./package.json");
  console.log(pkg.workspaces.join("\n"));
')

# name -> workspace directory
declare -A DIR_FOR_NAME
while IFS= read -r dir; do
  [ -f "$dir/package.json" ] || continue
  name=$(node -e "console.log(require('./$dir/package.json').name)")
  DIR_FOR_NAME["$name"]="$dir"
done <<< "$WORKSPACE_DIRS"

echo "==> resolving transitive @justjs/*, @justscript/* dependency closure"
declare -A CLOSURE
QUEUE=("${ROOTS[@]}")
while [ "${#QUEUE[@]}" -gt 0 ]; do
  name="${QUEUE[0]}"
  QUEUE=("${QUEUE[@]:1}")
  [ -n "${CLOSURE[$name]:-}" ] && continue
  dir="${DIR_FOR_NAME[$name]:-}"
  if [ -z "$dir" ]; then
    echo "error: unknown workspace package '$name' (not found in package.json's workspaces list)" >&2
    exit 1
  fi
  CLOSURE["$name"]="$dir"
  deps=$(node -e "
    const pkg = require('./$dir/package.json');
    const deps = Object.keys(pkg.dependencies || {});
    console.log(deps.filter(d => d.startsWith('@justjs/') || d.startsWith('@justscript/')).join('\n'));
  ")
  while IFS= read -r dep; do
    [ -n "$dep" ] && QUEUE+=("$dep")
  done <<< "$deps"
done

echo "==> closure: ${!CLOSURE[*]}"

echo "==> building and packing each package in the closure"
declare -A PACKED_VERSION
for name in "${!CLOSURE[@]}"; do
  dir="${CLOSURE[$name]}"
  slug="${name#@}"
  slug="${slug/\//-}"
  echo "  -> $name ($dir)"

  bun run --filter "$name" build >/dev/null

  # dist/ is gitignored, so `npm pack` run in place would silently exclude
  # it (npm pack respects .gitignore) - stage dist/ + package.json in a
  # git-agnostic temp dir first, then pack from there.
  pkg_stage="$STAGE_DIR/$slug"
  rm -rf "$pkg_stage" && mkdir -p "$pkg_stage"
  cp -r "$dir/dist" "$pkg_stage/dist"
  cp "$dir/package.json" "$pkg_stage/package.json"

  version=$(node -e "console.log(require('./$dir/package.json').version)")
  PACKED_VERSION["$name"]="$version"

  ( cd "$pkg_stage" && npm pack --silent --pack-destination "$OUTPUT_DIR" >/dev/null )
done

echo "==> emitting package-fragment.json"
{
  echo "{"
  echo '  "dependencies": {'
  first=1
  for name in "${!CLOSURE[@]}"; do
    slug="${name#@}"; slug="${slug/\//-}"
    version="${PACKED_VERSION[$name]}"
    tgz="${slug}-${version}.tgz"
    [ "$first" -eq 1 ] || echo ","
    first=0
    printf '    "%s": "file:vendor/%s"' "$name" "$tgz"
  done
  echo ""
  echo "  },"
  echo '  "overrides": {'
  first=1
  for name in "${!CLOSURE[@]}"; do
    slug="${name#@}"; slug="${slug/\//-}"
    version="${PACKED_VERSION[$name]}"
    tgz="${slug}-${version}.tgz"
    [ "$first" -eq 1 ] || echo ","
    first=0
    printf '    "%s": "file:vendor/%s"' "$name" "$tgz"
  done
  echo ""
  echo "  }"
  echo "}"
} > "$OUTPUT_DIR/package-fragment.json"

echo "==> done. Tarballs + package-fragment.json written to $OUTPUT_DIR"
echo "See package-fragment.json for the dependencies/overrides block to merge"
echo "into your own package.json (adjust the 'vendor/' path if you place the"
echo "tarballs somewhere else relative to your package.json)."
