# Deployment Playbook — JustScript Workspaces

Guides publishing `@justscript/core` and `@justscript/measurement` to npm.

## Pre-deployment checklist

- [ ] All tests pass: `bun test`
- [ ] Full typecheck passes: `bun run typecheck`
- [ ] Workspace builds in isolation: `cd scm/main && bun install && bun run build`
- [ ] No uncommitted changes: `git status`
- [ ] Current branch is `main` and up to date with remote: `git log -1 --oneline`
- [ ] Benchmark baseline is current: `git log -1 --oneline -- scm/main/benchmarks/baseline.json`

## Publishing to npm

### 1. Update version in both package.json files

```bash
# @justscript/core
cd justscript/scm/main
npm version patch  # or minor, major
cd ../../../

# @justscript/measurement
cd measurement/scm/main
npm version patch  # or minor, major
cd ../../../
```

This creates git tags and updates package.json.

### 2. Build both workspaces

```bash
bun run --filter "@justscript/core" build
bun run --filter "@justscript/measurement" build
```

Verify `dist/` directories are populated:
```bash
ls justscript/scm/main/dist/saf/
ls measurement/scm/main/dist/saf/
```

### 3. Publish to npm

```bash
cd justscript/scm/main
npm publish --access public

cd ../../measurement/scm/main
npm publish --access public
```

Verify on npm registry:
- https://www.npmjs.com/package/@justscript/core
- https://www.npmjs.com/package/@justscript/measurement

### 4. Tag and push

```bash
git push origin main --tags
```

## Rollback procedure

If a published version has a critical bug:

1. **Do NOT delete from npm** — npm prevents republishing the same version.
2. **Publish a patch immediately:**
   - Fix the bug
   - `npm version patch`
   - `npm publish --access public`
   - Tag and push

3. **Announce in releases** — document what was broken and what the patch fixes.

## Artifact retention

Published packages are immutable on npm. The source is the git tag:

```bash
# Verify source matches published version
git show v0.1.0:justscript/scm/main/package.json | grep version
npm view @justscript/core@0.1.0 version
```

## Dependency updates

`@justscript/measurement` depends on `@justscript/core`. After publishing core, measurement picks up the new version automatically via `workspace:*` resolution.

If publishing to separate npm orgs in future, update `package.json`:

```json
{
  "dependencies": {
    "@justscript/core": "^0.1.0"
  }
}
```

And run `bun install` to update `bun.lock`.
