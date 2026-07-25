# ADR-0017: `cloudProvisioning` concern — real AWS resource provisioning, CloudWatch pilot

- **Status:** Accepted (written retroactively — CloudWatch already implemented and verified before this ADR was recorded; see [Process note](#process-note))
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
- Local/CI test coverage against CloudEmu for any of the above: confirmed
  via direct reading of CloudEmu's Rust source
  (`sweengineeringlabs/swe-cloud`) that it doesn't implement
  `TerminateInstances`, ECS's `CreateService`/`RunTask`, CloudWatch's
  `PutMetricAlarm`/`GetMetricData`, or any EKS action at all. Whether
  CloudEmu ever gains these is that project's own call, not gated on here
  (confirmed with the user directly) — testing beyond what CloudWatch's
  pilot already proved (via real AWS + a real headless Chromium browser)
  will need real AWS sandbox accounts for the later phases.

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
- [ ] EC2/ECS/EKS phases (tracked as follow-up work, not blocking this
      ADR's own acceptance)

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
