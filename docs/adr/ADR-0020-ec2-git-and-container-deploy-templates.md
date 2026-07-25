# ADR-0020: Git-repo and container-image deploy templates for EC2

- **Status:** Accepted, implemented
- **Date:** 2026-07-25

## Summary

ADR-0019 shipped two deploy mechanisms for EC2 - `UserData` at launch
and SSM in-place redeploy - both taking a raw shell script/command list
typed by hand. This adds two guided input modes that *generate* that
script, for the two most common real deploy shapes (pull from git,
run a container image), alongside the existing free-text mode - no new
AWS capability, no change to `CloudProvisioningProvider`'s contract at
all. Everything here is client-side templating on top of what
justjs#144/#147/#148 already built.

## Why this is purely a UI-layer change

`Ec2InstanceConfig.userData` and `runCommandOnEc2Instance`'s `commands`
are already just strings/string arrays - a shell script and a list of
shell commands, respectively. Generating those strings from a more
guided form (git repo URL + branch, or a container image reference)
instead of asking the user to hand-write shell is entirely an
`ai-code-editor`-side concern. `@justjs/cloud-connect` needs zero
changes.

## Real, load-bearing constraint carried over from ADR-0019

This app has no backend - there is no webhook receiver, no CI runner,
nothing that could react to a real `git push` and trigger a redeploy on
its own. Every mode below is **pull-based, manually triggered from the
app** (the user clicks Launch or Redeploy), not push-triggered
automation. A real "deploy on push" pipeline would need a backend this
app doesn't have and isn't gaining - not a gap in this feature, a hard
platform constraint, same class as EC2 deploy having no SSH option at
all.

## Three input modes, not one replaced

1. **Raw script** (unchanged) - the existing free-text textarea, kept
   as-is for anything the guided modes don't cover.
2. **Git repo** - repo URL, branch (default `main`), start command.
   Generates:
   - Launch (`UserData`): `git clone --branch <branch> --depth 1 <repoUrl> /opt/app && cd /opt/app && <startCommand>`
   - Redeploy (SSM commands): `cd /opt/app && git pull && <startCommand>`
3. **Container image** - an image reference (e.g. `nginx:latest` or a
   real ECR URL) and a port. Generates:
   - Launch (`UserData`): installs Docker (assumes Amazon Linux 2023 -
     `dnf install -y docker`, matching AWS's own EC2 console default
     quick-launch AMI - a disclosed assumption, not silently guessed),
     starts the daemon, then `docker run -d --name app -p <port>:<port> <image>`.
   - Redeploy (SSM commands): `docker pull <image> && docker stop app || true && docker rm app || true && docker run -d --name app -p <port>:<port> <image>`.

Real, deliberately **not** offered: "git repo, built into a container on
the instance" (`docker build` from a cloned repo's `Dockerfile`). A real
build step on the instance has real, hard-to-debug failure modes this
app has no way to surface (no build-log streaming - SSM's own output
capture is post-hoc, not live) - pulling a pre-built image is the far
more common real container-deploy shape anyway (build happens in CI,
this app only ever runs what already exists in a registry).

## Resolved decisions

- **Private git repos are out of scope for v1.** `UserData` and SSM
  command output are both visible in plaintext to anyone with read
  access to the instance (`DescribeInstanceAttribute`/
  `GetCommandInvocation`) - embedding a real git credential (PAT) in a
  generated script is a real secret-leak vector this app won't build a
  *dedicated* input field to encourage. A user can still paste a
  `https://<token>@github.com/...`-shaped URL into the repo URL field
  themselves (already possible, this app doesn't special-case or
  validate the URL's shape) - that's their own informed choice, not
  something this feature actively offers or hints at.
- **Container mode assumes Amazon Linux 2023** (`dnf`-based Docker
  install). Disclosed directly in the UI copy, not hidden - a
  Debian/Ubuntu-based AMI would need a different install command this
  mode doesn't generate. Real out-of-scope, not a bug: pick "Raw
  script" and hand-write the install command for a different base OS.
- **Redeploy assumes the same working directory/container name the
  matching launch mode established** (`/opt/app`, container name
  `app`) - if a user launches with "Git repo" mode and later redeploys
  with "Container image" mode's generated commands (or vice versa),
  the commands won't line up. Not cross-checked or prevented - this app
  has no way to know what's actually running on a real instance beyond
  what it itself launched (and even that's only remembered via
  `ec2_ledger.ts`'s own best-effort local record, not queried from the
  instance).

## Scope

### In scope

- `core/ec2_deploy_templates.ts` - pure functions generating the
  `UserData` script and the SSM command list for "Git repo" and
  "Container image" modes, given their respective structured inputs.
- `Ec2ProvisioningControl`'s Configure form gains a mode selector
  (Raw script / Git repo / Container image) - selecting a guided mode
  shows that mode's own structured fields and a real, live preview of
  the generated script/commands (so the user sees exactly what will
  run, not a black box), instead of the raw textarea.
- The Redeploy panel gains the same mode selector, generating the SSM
  command list the same way, for the instance already running.
- Real tests: template generation for both modes (git repo → correct
  clone/pull commands; container image → correct install/run/restart
  commands), including the disclosed directory/container-name
  assumption.

### Out of scope (disclosed, not deferred silently)

- Push-triggered auto-deploy (no backend to receive a webhook - a hard
  platform constraint, not a future phase).
- Private git repo credential handling (real secret-leak vector via
  plaintext `UserData`/SSM output - v1 doesn't offer a dedicated input
  for this).
- Building a container image on the instance from a cloned repo's
  Dockerfile (no live build-log streaming to debug a failure with).
- Any AMI OS other than Amazon Linux 2023 for the Container image mode's
  generated Docker install step.
- Real ECS/container-orchestration support (task definitions, services,
  cluster management) - a materially larger, separate scope already
  named as its own future phase in ADR-0017/justjs#144.

## Implementation evidence

- `core/ec2_deploy_templates.ts` - `generateGitRepoUserData`/
  `generateGitRepoRedeployCommands`/`generateContainerImageUserData`/
  `generateContainerImageRedeployCommands`, real tests (6, ordering-
  sensitive assertions on the generated script/command sequence, not
  just presence checks).
- `Ec2ProvisioningControl`'s Configure form and Redeploy panel both gain
  a `Deploy mode` selector (Raw script / Git repo / Container image),
  each guided mode showing its own structured fields and a live `<pre>`
  preview of the exact generated script/commands - updated directly on
  `input` events (not via a full `render()`, which would rebuild every
  input from scratch mid-keystroke and drop focus, the same class of
  bug ADR-0019's own Configure-form fix addressed).
- Real tests: `ai-code-editor` suite 72/72 (was 66, +6). Full workspace
  `bun run build`/`typecheck`/`test` green.
- Live-verified end to end through the actual dev-server UI against a
  real local `cloudemu-server` (justjs#148's in-browser override, zero
  mocking, zero standalone scripts):
  - **Git repo mode**: typed a repo URL + start command, confirmed the
    live preview matched `generateGitRepoUserData`'s exact output,
    launched a real instance - accepted and running.
  - **Container image mode** (Redeploy): typed an image reference,
    confirmed the live preview matched `generateContainerImageRedeployCommands`'s
    exact output, sent it via real SSM `SendCommand` against an
    instance launched with a real IAM profile - `Status: Success`,
    with the exact `docker pull`/`stop`/`rm`/`run` sequence echoed back.

## Acceptance criteria

- [x] `core/ec2_deploy_templates.ts` generates correct scripts/commands
      for both guided modes, real tests
- [x] Configure form's mode selector shows a live preview of the exact
      generated script/commands, not just a description of what it'll do
- [x] Redeploy panel gains the same mode selector
- [x] Real UI verification (dev-server browser, real CloudEmu via
      justjs#148's endpoint override) - a git-repo-mode launch and a
      container-image-mode redeploy both produce the expected real
      request body
- [x] Full workspace build/typecheck/test stays green

## Relates to

- [ADR-0019](ADR-0019-ec2-app-deployment.md) - the `userData`/SSM
  mechanisms this feature generates input for; the "no backend, no
  webhook" constraint this ADR's own scope decision inherits directly
- justjs#144/#147/#148 - the EC2 phase, deploy options, and in-browser
  CloudEmu testing this builds on, all unchanged by this feature
