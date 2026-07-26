# ADR-0019: Deploying an application to a provisioned EC2 instance

- **Status:** Accepted — both Option A and Option B ship, opt-in per
  instance (see [Decision](#decision)); Option B restricted to
  sub-option (b1) permanently (see
  [IAM policy](#iam-policy-this-app-never-creates-iam-roles))
- **Date:** 2026-07-25 (revised same day: both options ship, not just A)

## Summary

justjs#144/ADR-0017's EC2 phase ships instance lifecycle (`RunInstances`/
`StartInstances`/`StopInstances`/`TerminateInstances`) - launching a
real instance, but no way to get application code onto it. This proposes
what "deploy" should actually mean for EC2, following up on the same
connect → configure → deploy → monitor workflow the rest of this app's
cloud features already use.

## Why this needs its own decision, not a default

Every other provider's `deploy()` in this app (Netlify/Vercel/Heroku)
works the same way: push new code to an *existing* target, update in
place, no new resource created per deploy. EC2 cannot do that the same
way for a real, load-bearing reason unrelated to this app's own
choices: **a browser has no raw socket API, so SSH is never possible
from this app, for any option.** Every EC2 deploy mechanism has to go
through an AWS API call instead of a shell connection, and the two real
AWS mechanisms for that have meaningfully different scope, safety, and
prerequisite implications - not a detail to default silently.

## Option A: `UserData` at launch (cloud-init script)

`RunInstances` already accepts a `UserData` field (a base64-encoded
script cloud-init runs once on first boot - install a runtime, pull code
from a URL/git repo, start a server). This is real and immediately
buildable:

- No new AWS permissions beyond what EC2's existing `RunInstances` call
  already needs.
- No new prerequisite the user has to set up outside this app.
- Real limitation, disclosed not papered over: `UserData` only runs at
  first boot. "Redeploying" a code change means terminating the old
  instance and launching a new one with updated `UserData` - not an
  in-place update the way Netlify/Vercel/Heroku's `deploy()` already
  behaves in this app. A user relaunching to redeploy also loses
  whatever the old instance's own EC2-phase ledger entry was tracking
  (mitigated by relaunch adding a fresh ledger entry and the user
  terminating the old one manually - not automatic).

## Option B: SSM `SendCommand` for real in-place redeploy

AWS Systems Manager can run a script on an *already-running* instance
with no SSH - the only real way to match Netlify/Vercel/Heroku's own
"redeploy same target" semantics for EC2. Real, but has a prerequisite
this app cannot itself satisfy today:

- Requires the target instance to already have an IAM instance profile
  attached with SSM permissions (`AmazonSSMManagedInstanceCore` or
  equivalent) - without it, the instance never registers with SSM and
  `SendCommand` has nothing to reach.
- This app has no IAM role/instance-profile creation capability today,
  and creating one is a materially more sensitive action than anything
  built so far (EKS's own full-`CreateCluster` was ruled out in
  ADR-0017 specifically for the same "needs a pre-existing IAM role"
  reason - this option runs into the identical wall).
- Two sub-options if this path is chosen: (b1) document the IAM
  instance profile as a prerequisite the user sets up themselves in the
  AWS console before using this feature (this app only ever calls
  `SendCommand`, never touches IAM), or (b2) this app also gains a real
  "create IAM instance profile for SSM" capability - a new, higher-risk
  category of AWS action, deserving its own ADR/issue if pursued, not
  folded into this one silently.

## Decision

**Both options ship, opt-in per instance, not one chosen over the
other.** They solve different problems (deploy-at-launch vs. redeploy-
in-place) and neither one's existence blocks or is weakened by the
other - a user picks per instance by what they fill in on the Configure
form:

- Leave both new fields blank → today's plain instance, no deploy
  mechanism at all (unchanged from before this ADR).
- Fill in `userData` only → Option A, deploy-at-launch.
- Fill in `iamInstanceProfileName` (pre-provisioned by the user in AWS's
  own console, per the IAM policy below) → Option B becomes available
  for that instance in Monitor, as a genuine opt-in: this app never
  guesses or requires it, it only offers the SSM redeploy action for
  instances the user explicitly attached a profile to. Nothing forces a
  choice between A and B - an instance can use `userData` at launch
  *and* later be redeployed via SSM, if the user set up both.

## IAM policy: this app never creates IAM roles

This is a permanent policy for this app, not a placeholder pending a
future capability. IAM role/policy creation is a categorically
higher-risk action than anything else this app does - a wrong trust
policy or an over-broad permission affects the whole AWS account, not
one resource - and this app already has the weakest possible security
posture for taking on more of that risk: long-term pasted access keys,
no backend to review or gate the action, sent straight from a browser
(see `aws_cloud_provisioning_provider.ts` and `aws-sigv4`'s own
comments on why long-term keys are already a disclosed tradeoff, not
something to compound). If Option B is ever built, this app only ever
calls `SendCommand` against an IAM instance profile the user
provisioned themselves, once, outside this app (AWS Console/
CloudFormation/Terraform) - the same one-time-setup pattern real
security-conscious integrations already use for cross-account roles.
Sub-option (b2) - this app creating that role itself - is rejected
outright, not merely deferred.

## Availability is an AWS-side property, not a client-side one

Neither option gives zero-downtime deploys, and this is an AWS
architecture question, unrelated to which client (this app's mobile
build, its browser build, `aws-cli`, or anything else) issues the API
call - EC2 has no concept of "caller platform." A signed `RunInstances`/
`SendCommand` call behaves identically regardless of what triggered it;
the instance then lives entirely on AWS's own infrastructure,
completely decoupled from the client that launched it.

- **Option A** (terminate + relaunch): a real availability gap between
  terminating the old instance and the new one becoming reachable, plus
  a new public IP/DNS name each time (this app has no Elastic IP or DNS
  management today) - disclosed directly in the UI copy (see Scope
  below), not hidden.
- **Option B** (SSM run-in-place): shorter, but still a real interruption
  while the app process restarts on that single instance.
- **Real zero-downtime** needs a materially larger, separate architecture
  (Application Load Balancer + target group + Auto Scaling Group +
  rolling/blue-green deploy) - out of scope for this ADR entirely, and
  deserving its own explicit ADR/issue if it's ever pursued, not
  something either option here quietly grows into.

## Scope

### In scope (both options - implementation tracked in justjs#147)

**Option A:**
- `Ec2InstanceConfig` gains an optional `userData` field, passed through
  to `RunInstances`' real `UserData` parameter (base64-encoded per AWS's
  API contract).
- `Ec2ProvisioningControl`'s Configure form gains a real textarea for a
  startup script, with disclosed-limitation hints directly in the UI
  copy: runs once at first boot only (redeploying means launching a new
  instance), and no zero-downtime guarantee (new instance = new
  public IP, a real gap while the old instance is terminated and the
  new one boots).

**Option B:**
- `Ec2InstanceConfig` gains an optional `iamInstanceProfileName` field,
  passed through to `RunInstances`' real `IamInstanceProfile.Name`
  parameter - opt-in only, this app never creates the profile itself
  (see IAM policy above).
- New `CloudProvisioningProvider` methods: `runCommandOnEc2Instance?`
  (SSM `SendCommand` with the `AWS-RunShellScript` document) and
  `getEc2CommandStatus?` (SSM `GetCommandInvocation`, so the UI can show
  a real result, not a fire-and-forget with no feedback).
- `Ec2ProvisioningControl`'s Monitor section gains a "Redeploy" action
  per running instance, opening a script textarea and showing the real
  command status/output once available - no client-side guessing about
  whether an instance is SSM-eligible; if it isn't (no profile attached,
  SSM agent not registered), AWS's own real error surfaces directly.

**Both:**
- Real tests: request shape (base64 `UserData` encoding, `IamInstanceProfile.Name`
  param, SSM `SendCommand`/`GetCommandInvocation` shapes and error
  handling) and the documented limitations actually present in the
  rendered UI copy.
- Live verification: CloudEmu doesn't implement SSM at all (confirmed by
  source read, `sweengineeringlabs/cloud`), so Option B is verified the
  same way CloudWatch/Bedrock were before CloudEmu supported them - real
  AWS, deliberately-invalid credentials, real headless Chromium.

## Implementation evidence

- `api/provisioning.ts`: `Ec2InstanceConfig.userData?`/`iamInstanceProfileName?`,
  `Ec2CommandResult`, `Ec2CommandStatus`, `runCommandOnEc2Instance?`/
  `getEc2CommandStatus?` on `CloudProvisioningProvider`.
- `AwsCloudProvisioningProvider`: `UserData`/`IamInstanceProfile.Name`
  wired into `RunInstances`; a new `ssmCall()` helper (JSON/X-Amz-Target,
  mirroring `BedrockAiAssistProvider`'s own shape) backing
  `runCommandOnEc2Instance`/`getEc2CommandStatus`.
- **A real bug found and fixed via live verification, not just unit
  tests**: SSM's actual response content-type is
  `application/x-amz-json-1.1`, not `application/json` -
  `@justjs/transport`'s `ApiAdapter` only JSON-parses bodies whose
  content-type contains the latter, so a real SSM error response
  arrived as an unparsed string, and the first version of `ssmCall()`
  surfaced a useless generic `HTTP_400 - Bad Request` instead of AWS's
  real `UnrecognizedClientException` message. Caught specifically by
  live-verifying against real AWS with deliberately-invalid credentials
  (unit tests alone, which faked an already-parsed response object,
  would never have caught this - they were rewritten afterward to fake
  a raw JSON string instead, matching the real wire shape). Fixed by
  parsing `response.data` by hand when it's still a string; re-verified
  live afterward, now returns the correct
  `UnrecognizedClientException - The security token included in the
  request is invalid.`
- `ai-code-editor`: `Ec2ProvisioningControl`'s Configure form gains a
  `userData` textarea and `iamInstanceProfileName` field, both with
  disclosed-limitation copy inline; Monitor gains a "Redeploy" action per
  running instance (script textarea, Send Command, Command ID + Check
  Status). **Update (justjs#151, ADR-0022):** Configure and Monitor
  (including this Redeploy action) later split into two separate custom
  elements on two separate SDLC stages - see ADR-0022. Every "Configure
  form"/"Monitor" reference on this page describes the pre-split, single-
  screen shape.
- Real tests: cloud-connect suite 56/56 (was 46, +10 - 3 for
  `UserData`/`IamInstanceProfile.Name`, 7 for SSM including the string-
  body regression test the live bug produced).
- Full workspace `bun run build`/`typecheck`/`test`: every package green.
- Live-verified against real AWS using the actual `AwsCloudProvisioningProvider`
  class (not a standalone script): `runCommandOnEc2Instance`/
  `getEc2CommandStatus` both return the correct real
  `UnrecognizedClientException` for deliberately-invalid credentials.
- Live-verified the real UI: headless Chromium against the actual dev
  server confirmed both new Configure fields render with their disclosed-
  limitation copy, and (using `browse mock` to fake a running instance,
  since no real AWS credentials were available) that the Redeploy panel
  opens, accepts a script, and correctly surfaces a real fetch failure
  through the same error-handling path as every other action in this
  control (the mocked SSM response itself couldn't complete due to a
  CORS limitation of the mocking tool against a real cross-origin host -
  a tooling constraint, not evidence of a code defect; the success-path
  JSON parsing is already covered by the cloud-connect unit tests, which
  don't go through a real browser fetch/CORS boundary).
- On-device (Android) verification: both new Configure fields confirmed
  rendering correctly on the real installed app, twice, across an app
  restart. The Monitor round-trip re-check hit a real, current device
  network problem unrelated to this change - confirmed by a bare
  `fetch()` to the same AWS host hanging for 2+ minutes from the device
  itself - the same class of real WiFi-instability issue already root-
  caused during this app's earlier CloudWatch verification (weak/
  unstable connection, not a code defect). Not chased further given it
  was independently confirmed as a device/network condition, not
  something introduced by this change - the equivalent code path
  (`listEc2Instances`) was already verified working on this same device
  earlier this session.

### Out of scope (permanent, not just for this phase)

- SSH-based deploy of any kind - not possible from a browser, not a
  future phase either, a hard platform constraint.
- IAM role/instance-profile creation (Option B's (b2) sub-option) -
  rejected outright, see IAM policy above.
- Zero-downtime deploy (ALB + target group + Auto Scaling Group +
  rolling/blue-green) - a materially larger, separate architecture
  question, deserving its own ADR/issue if ever pursued.

## Acceptance criteria

- [x] A real decision recorded on which option ships first, with
      reasoning
- [x] A real, permanent decision recorded on the IAM question (this app
      never creates IAM roles - rejected outright, not deferred)
- [x] A real decision recorded on availability/downtime expectations,
      disclosed as an AWS-architecture property independent of client
- [x] Option A implementation: tested (56/56), live-verified
- [x] Option B implementation: tested (56/56), live-verified against
      real AWS (found and fixed a real content-type parsing bug in the
      process)

## Relates to

- [ADR-0017](ADR-0017-cloud-provisioning-concern.md) - the EC2 instance
  lifecycle this proposal builds "deploy" on top of, and the precedent
  for ruling out a feature specifically because it needs a
  pre-existing IAM role (EKS's full-`CreateCluster`)
- Tracked by justjs#144 (EC2 phase's own tracking issue) - this
  deployment question is a real, distinct follow-up from that issue's
  own EC2 tasks, which are already complete
