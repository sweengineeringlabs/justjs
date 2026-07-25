# ADR-0017: `cloudProvisioning` concern — real AWS resource provisioning, CloudWatch pilot + EC2 phase

- **Status:** Accepted (CloudWatch written retroactively — see [Process note](#process-note); EC2 phase added 2026-07-25, tasks/ACs and ADR updated before/alongside implementation this time)
- **Date:** 2026-07-25

## Summary

A real guided workflow (connect → configure → deploy → monitor) for provisioning
actual AWS infrastructure from `ai-code-editor`'s Cloud screen, starting with
CloudWatch alarms. Adds a new SAF concern, `cloudProvisioning`, to
`@justjs/cloud-connect`, kept separate from the existing `cloudConnect`
concern.

## Why a separate concern, not new methods on `CloudConnectProvider`

`CloudConnectProvider` is implemented by 7 unrelated providers (AWS/GCP/
Azure/DigitalOcean/Vercel/Netlify/Heroku) and its only provider-specific
optional methods (`listInstances?()`, `deploy?()`) were each justified from
exactly one real call site — not broad enough to justify a generic "extra
actions" plugin surface. EC2/ECS/EKS/CloudWatch provisioning is AWS-only,
multi-step, and stateful in a way those two methods never were (a single
read, or one bounded upload-and-poll sequence). Bolting 10+ AWS-only
optional methods onto a contract 6 other providers implement would repeat
the exact anti-pattern that original design already avoided, in the
opposite direction (over-widening a shared contract instead of
under-widening a control). A new concern, matching the precedent
`dashboardAnalytics` (justjs#139) already set for "a second real thing this
package does, cutting across providers differently than the first," is the
correct shape.

## Real body-signed SigV4 requests (Phase 0, shared prerequisite)

`aws_sigv4.ts`'s `signAwsRequest()` previously hashed an empty payload
unconditionally ("every call this package makes is a bodyless GET" — true
at the time). CloudWatch's own Query-API-via-POST convention (and ECS's
JSON-protocol / EKS's REST-JSON conventions, needed by later phases) all
need a real signed body. Extended `AwsSigningRequest` with an optional
`body` field, hashed instead of `""` when present — signing mechanics are
identical across all three wire protocols; only how the *caller* builds
query/headers/body differs. Cross-checked against an independent
Node-crypto hash of the real body (same discipline the original signer's
own STS cross-check used), not just unit-tested for shape.

## Scope

### In scope (implemented)

- `api/provisioning.ts` — `CloudProvisioningProvider` contract:
  `putCloudWatchAlarm?`/`listCloudWatchAlarms?`/`deleteCloudWatchAlarm?`/
  `getCloudWatchMetricStatistics?`. All optional, matching `deploy()`'s own
  "only implemented where it makes sense" posture — EC2/ECS/EKS method
  groups are deliberately **not** declared yet (see Known limitations).
- `core/aws_cloudwatch_provider.ts` (`AwsCloudWatchProvisioningProvider`) —
  real implementation, own file rather than folded into
  `AwsCloudConnectProvider` (which already carries connect + listInstances
  at the read-only tier — a third responsibility belongs in its own class,
  same reasoning `NetlifyCloudConnectProvider` already being separate from
  `DefaultCloudConnectProvider` establishes).
- `ai-code-editor`: `CloudProvisioningControl` — a real Configure form
  (metric/namespace/statistic/period/threshold/comparison operator) +
  Create (with a real, distinct confirm step, not a single click) +
  Monitor (live alarm list, state badges, delete). Mounted as a second
  tile ("Alarms") alongside the existing Dashboard tile in Deployment's
  Cloud screen.

### Why CloudWatch first

The only one of the four requested services with **zero cost and zero
irreversible action**, even against a real AWS account — an alarm is free
and instantly deletable. No other AWS action this app could take shares
that property, which is why it ships before EC2/ECS/EKS: those need real
cost disclosure and a proven destroy path first, not just a working
`create` call.

### Out of scope (deferred, not forgotten — later phases)

- **EC2**: `RunInstances` must not ship without `TerminateInstances` in the
  same phase — this app has no backend to mediate a mistake, and EC2 is
  the first genuinely billable, hard-to-undo action in its history. A
  persisted "resources this app believes it created" ledger and real cost
  disclosure are required parts of that phase, not follow-up polish.
- **ECS**: inherits every EC2-phase safety gate (Fargate tasks are real
  money too).
- **EKS**: narrowed to `ListClusters`/`DescribeCluster` only — full
  `CreateCluster` is not realistic for a browser-only app with pasted
  credentials (10-15+ min creation time, needs a pre-existing IAM role +
  VPC/subnets + node groups already provisioned elsewhere). Full creation
  is explicitly out of scope unless a separate, dedicated ADR/issue
  revisits it.
- ~~Local/CI test coverage against CloudEmu for any of the above~~ —
  **superseded 2026-07-25.** At the time this ADR was written, direct
  reading of CloudEmu's Rust source (`sweengineeringlabs/cloud`) confirmed
  it implemented neither `TerminateInstances` nor ECS's
  `CreateService`/`RunTask`. CloudEmu has since landed real EC2
  (`RunInstances`/`StartInstances`/`StopInstances`/`TerminateInstances`)
  and ECS (`RunTask`/`StopTask`/`DescribeTasks`/`ListTasks`/
  `CreateService`/`DescribeServices`/`DeleteService`/`DeleteCluster`)
  lifecycle support, plus CloudWatch's `GetMetricStatistics`/
  `GetMetricData`/`PutMetricAlarm`/`DescribeAlarms`/`DeleteAlarms`
  (`sweengineeringlabs/cloud@e04a828`, fixed for the real
  query-protocol+XML wire format in `@dfceba9`). Independently
  live-verified (not just trusting the commit or its own unit tests): a
  full EC2 RunInstances → DescribeInstances → TerminateInstances
  lifecycle and a full ECS CreateCluster → RegisterTaskDefinition →
  RunTask → DescribeTasks → StopTask → DeleteCluster lifecycle, both via
  real SigV4-signed requests from `@justjs/aws-sigv4` against a freshly
  rebuilt `cloudemu-server`, returned correct real responses end to end.
  This means the EC2/ECS phases below can now be built with a real local
  test loop (CloudEmu) in addition to the real-AWS-sandbox path the
  CloudWatch pilot relied on exclusively — the EC2/ECS phases are moving
  from "not started" to in progress as a result (tracked in justjs#144).

## EC2 phase (justjs#144, done 2026-07-25)

Implemented once CloudEmu gained a real local test loop for EC2 (see the
superseded-note above) - built with the same shape as the CloudWatch
pilot, extended with the two things EC2's real cost/risk profile demands
that an alarm never needed:

- `runEc2Instance?`/`listEc2Instances?`/`startEc2Instance?`/
  `stopEc2Instance?`/`terminateEc2Instance?` added to
  `CloudProvisioningProvider` together, in the same change - no
  `RunInstances` without a proven `TerminateInstances` alongside it.
- `AwsCloudWatchProvisioningProvider` renamed to
  `AwsCloudProvisioningProvider` (it now covers CloudWatch + EC2 under
  the one "aws" `cloudProvisioning` strategy - only one factory can be
  registered per concern/strategy pair, so this couldn't be a second,
  separate class).
- Real cost disclosure: `core/ec2_cost_estimates.ts`, sourced from AWS's
  own published us-east-1 on-demand rates for the 6 instance types this
  app's Configure form offers - disclosed as an estimate, not a live
  quote (no public unauthenticated AWS pricing API this browser-only app
  could call).
- A persisted "resources this app believes it created" ledger
  (`core/ec2_ledger.ts`, localStorage-backed) - survives reload/tab-close,
  reconciled against the real, live instance list whenever it loads
  successfully.
- A second, distinct confirmation step beyond CloudWatch's own single
  confirm button: launching requires checking an explicit "I understand
  this launches a real, billable instance…" checkbox before Confirm
  Launch even becomes clickable.
- `ai-code-editor`: `Ec2ProvisioningControl`, a third sibling tile
  ("Instances") alongside Dashboard/Alarms in Deployment's Cloud screen.

**Verified, not just claimed:**
- `@justjs/cloud-connect` package suite: 46/46 (was 37, +9 EC2 tests).
- `ai-code-editor` suite: 66/66 (was 57, +9: 6 ledger tests, 3 cost-
  estimate tests).
- Full workspace `bun run build`/`typecheck`/`test`: every package green.
- Live-verified the real `AwsCloudProvisioningProvider` class (not a
  standalone script) end to end against a freshly rebuilt CloudEmu:
  RunInstances → DescribeInstances → StopInstances → TerminateInstances,
  plus a real `ResourceNotFound` error for an unknown instance ID.
- Live-verified the real UI (headless Chromium against the actual dev
  server, `browse` CLI - no Chrome extension available this session):
  navigated Home → Deployment → Cloud → Instances via the same
  `item-select` events the real grid components dispatch, confirmed the
  Configure form's cost estimate renders correctly, confirmed Monitor
  auto-loads and surfaces a real AWS `AuthFailure` error (proving the
  full UI → core adapter → cloud-connect → real signed request → real
  AWS EC2 endpoint path works end to end - the browser can't use the
  Node/bun-only `CLOUD_CONNECT_AWS_EC2_ENDPOINT` override to redirect to
  CloudEmu, so real AWS + a deliberately-invalid key is this app's own
  real verification path from a browser, same as the CloudWatch pilot's),
  and confirmed the confirm-checkbox gate gates the Confirm Launch button
  exactly as designed (disabled until checked, Cancel dismisses cleanly).

## Known limitations (disclosed, not papered over)

- CloudWatch's own `putCloudWatchAlarm`/`listCloudWatchAlarms`/
  `deleteCloudWatchAlarm`/`getCloudWatchMetricStatistics` request shapes
  are implemented per AWS's documented API reference, not independently
  confirmed against CloudEmu (which doesn't implement them) - the *code
  paths* are verified live against real AWS (see below), but not yet
  exercised against a full, real, successfully-authenticated account (only
  against intentionally-invalid test credentials, which correctly
  produced AWS's own real `InvalidClientTokenId` error).
- On-device (Android WebView) verification hit a real, root-caused
  environmental issue unrelated to this feature's own correctness: a weak/
  unstable WiFi connection (confirmed via `adb logcat` showing an
  in-progress DHCP lease renewal) caused an initial request to hang rather
  than fail cleanly. A subsequent fresh app-process restart, once the
  network stabilized, produced a clean, correctly-handled `Failed to
  fetch` error through the real UI - confirming the code path itself works
  correctly end-to-end, independent of the transient network condition.
  The identical signed request was independently verified correct via a
  desktop Node process and a real headless Chromium browser (confirming
  real CORS support from an actual browser context, not assumed).

## Acceptance criteria

- [x] `api/provisioning.ts` exists with the `CloudProvisioningProvider`
      contract, CloudWatch method group only
- [x] `AwsCloudWatchProvisioningProvider` implements all 4 methods, real
      tests (package suite 41/41, up from 33)
- [x] `aws_sigv4.ts`'s body-signing extension has a real, independent
      cross-check test (not just "it compiles")
- [x] `ai-code-editor`'s Cloud screen gets a real "Alarms" tile, gated on
      an existing AWS connection, with a real confirm-before-create step
- [x] Verified against real AWS (not just CloudEmu) from two independent
      environments (desktop Node, real headless Chromium)
- [x] EC2 phase: contract + `AwsCloudProvisioningProvider` extension,
      real tests (46/46), live-verified against CloudEmu (real class,
      full lifecycle) and against real AWS (real UI, real AuthFailure),
      cost disclosure, persisted ledger, distinct confirm gate, UI tile
- [ ] ECS/EKS phases (tracked as follow-up work in justjs#144, not
      blocking this ADR's own acceptance)

## Process note

This ADR was written after CloudWatch's implementation, not before it -
a real process gap against this repo's own established practice (every
other significant decision this session - the SCM/PM/Cloud Dashboard work,
the env-configurable-endpoints feature, the cross-repo RFC on backend
delegation - got a real issue with Tasks/ACs before or alongside
implementation). Tracked in justjs#144, filed retroactively for the same
reason.

## Relates to

- justjs#139 - `dashboardAnalytics`, the precedent this ADR's "separate
  concern" decision follows
- justjs#141 - the cross-repo RFC on backend-delegated credential
  verification, a related but distinct question (verifying a pasted
  credential vs. provisioning real resources with one)
- justjs#143 - the env-configurable-endpoints feature, used during this
  work's own local verification
- Tracked by justjs#144 (this ADR's own retroactive issue)
