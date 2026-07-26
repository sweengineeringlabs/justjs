# ADR-0022: Split Cloud's Configure/Monitor UI across Deployment and Operations

- **Status:** Accepted, implemented
- **Date:** 2026-07-26

## Summary

Every AWS resource control this app has shipped so far (`CloudProvisioningControl`
for CloudWatch alarms, `Ec2ProvisioningControl` for EC2 instances,
`EcsProvisioningControl` for ECS clusters/tasks - ADR-0017/ADR-0019/ADR-0020)
bundled two different concerns into one screen and one custom element:
**Configure/Create** (launch a new resource) and **Monitor** (list/start/
stop/terminate/redeploy/delete resources that already exist). All three lived
under Deployment → Cloud. Meanwhile Operations, a top-level SDLC stage that's
existed since this hub's own scaffolding, was a completely unwired stub -
`{ label: "Monitoring", icon: "📊" }` / `{ label: "Logs", icon: "📜" }`, neither
had an `action`/`route`, both rendered as an honest "Coming soon".

This splits Configure from Monitor for real: Deployment owns "configure/create
a new resource," Operations owns "monitor/manage what's already running" -
wiring up Operations' "Monitoring" stub for the first time with functionality
that already existed, just relocated, not reinvented.

## Why this needs its own decision, not a silent refactor

Direct user request ("we must split cloud into deployment and operations"),
not a bug fix - the old one-screen shape worked, this is a deliberate IA
change. Worth its own ADR because it touches every AWS provisioning control
this app has, moves a real cross-provider feature (Dashboard) to a new home,
and drops a piece of existing behavior (Configure's create-success handler
directly refreshing Monitor's list, only possible when they shared one
shadow root) - a real, disclosed tradeoff, not something to silently lose.

## Design

### The 3 existing controls keep their names, shrink to Configure-only

`CloudProvisioningControl`/`control-cloud-provisioning`,
`Ec2ProvisioningControl`/`control-ec2-provisioning`,
`EcsProvisioningControl`/`control-ecs-provisioning` keep their exact class/tag
names (minimal rename, minimal blast radius against 3 existing ADRs'
prose) but lose every Monitor-only state field, method, and render section.
Exploration before implementing confirmed this split was already mechanically
clean in all three: Configure-only and Monitor-only state fields were fully
disjoint, and `resetView()` already factored Monitor's own sub-panels
(Redeploy, Metrics, Tasks) into private helper methods - convenient for a
clean extraction, not a sign this needed restructuring first.

### 3 new sibling components - the Monitor halves

`AlarmMonitorControl`/`control-alarm-monitor`, `Ec2MonitorControl`/
`control-ec2-monitor`, `EcsMonitorControl`/`control-ecs-monitor` - each
imports only the list/action subset of its matching `core/*.ts` adapter
(e.g. `Ec2MonitorControl` never imports `runAwsEc2Instance`, only
`listAwsEc2Instances`/`start`/`stop`/`terminateAwsEc2Instance`/etc). Each
gates on `getStoredAwsCredentials()` directly, the exact mechanism all 3
original Configure controls already used - none of them ever referenced
`<control-cloud-connector>` as a sibling element, so there was no real
connector dependency to preserve once Monitor moved to a screen without one.

### Dropped: Configure directly refreshing Monitor's list

Configure's create/launch success handlers (`#handleCreate`/`#handleLaunch`)
used to call `await this.#loadX()` directly on success - a same-shadow-root
convenience. Since Monitor is now a separate component on a separate SDLC
stage, this is removed and replaced with an inline success message ("Alarm
created - check Operations → Monitoring to view/delete it."). This is a real
UX change, not silently dropped: Monitor's own lazy-load-on-open (`if
(this.#X === null && !loading && !error) void this.#loadX()`, untouched by
this refactor) is what makes "Operations always shows current state" work
with zero new cross-component signaling - the tradeoff is losing the
instant, same-screen list update after a launch/create.

The ledger-hint banner ("you may still be responsible for N instances/
tasks") moved from Configure's template to Monitor's - it's Monitor's
concern (the AWS ledgers, `ec2_ledger.ts`/`ecs_ledger.ts`, were already
module-level `localStorage` stores, not component state, so Configure
writing / Monitor reading across two separate custom elements needed zero
new synchronization). CloudWatch alarms have no ledger at all (free,
instantly deletable) - `AlarmMonitorControl` is simpler than the EC2/ECS
monitors for that reason.

### Dashboard moves to Operations too

Cloud's "Dashboard" tile (cross-provider analytics - AWS/GCP/Azure/
DigitalOcean/Vercel/Netlify/Heroku, `core/cloud_dashboard_analytics.ts`) is
read-only, same category as the new Monitoring screen - it moved to
Operations → Monitoring as a 4th tile alongside Alarms/Instances/Clusters,
confirmed directly with the user rather than assumed (it doesn't fit the
"AWS resource lifecycle" shape the other 3 do as cleanly, so this was a
genuine judgment call, not an obvious default). Deployment → Cloud's tile
grid shrank from 4 tiles to 3.

## Scope

### In scope

- New `SdlcFunction["action"]` literal `"cloud-monitoring"`, wired into
  Operations' `"Monitoring"` entry (`SDLC_STAGES`).
- New `renderCloudMonitoring()` in `sdlc_hub.ts`, structural clone of
  `renderCloudProviders()` minus the provider-connector, mounting the 3 new
  Monitor controls plus the relocated Dashboard tab machinery.
- The 3 new Monitor components + the 3 shrunk Configure-only components.

### Out of scope

- `Operations → "Logs"` - stays an unwired stub, unrelated to this split.
- Any change to `@justjs/cloud-connect`'s contract - this is a UI-layer-only
  reorganization, every `core/*.ts` adapter function signature is unchanged.
- Re-adding any cross-component signaling mechanism (event bus, shared
  reactive store) - Monitor's existing lazy-load-on-open is sufficient and
  deliberately not replaced with something more elaborate.

## Implementation evidence

- 3 new files: `components/alarm_monitor.ts`, `components/ec2_monitor.ts`,
  `components/ecs_monitor.ts`.
- 3 shrunk files: `components/cloud_provisioning.ts`, `components/ec2_provisioning.ts`,
  `components/ecs_provisioning.ts` - Monitor-only state/methods/render
  removed, ledger-hint banners relocated, direct `#loadX()` calls replaced
  with inline success messages.
- `components/sdlc_hub.ts`: new imports, `"cloud-monitoring"` action,
  `renderCloudMonitoring()` + 4 show/reset pairs (Dashboard/Alarms/
  Instances/Clusters), Dashboard's tab-rendering methods relocated and
  renamed (`renderCloudMonitoringDashboardTabs`/`loadCloudMonitoringDashboardData`/
  `renderActiveCloudMonitoringDashboardTab`/`renderCloudMonitoringAnalyticsTab`/
  `renderCloudMonitoringTrendingTab`/`renderCloudMonitoringActivitySection`/
  `renderCloudMonitoringSettingsTab`), reset-on-navigate-away block extended
  to cover the 4 new cached screens.
- Zero changes to any `core/*.ts` adapter - confirmed by grep, this is a
  pure UI-layer split.
- Real tests: `ai-code-editor` suite 83/83 (unchanged count - zero test
  files reference these UI controls or their custom-element tags, only
  `core/*_test.ts` modules, none of which changed signature). Full
  workspace `build`/`typecheck`/`test` green (`memory` package's own
  pre-existing, unrelated test failures confirmed via `git status` - that
  package was never touched by this change).
- Real live UI pass (dev server + a freshly rebuilt local CloudEmu,
  `browse` CLI):
  - Deployment → Cloud: 3 tiles only (Alarms/Instances/Clusters), no
    Dashboard.
  - EC2: launched a real instance via Configure - inline success message
    shown (`Instance "i-..." launched - check Operations → Monitoring...`),
    no live list on that screen. Navigated to Operations → Monitoring
    (previously an unwired "Coming soon" stub, now real) → Instances -
    the just-launched instance appeared via Monitor's own unmodified
    lazy-load-on-open, with the real ledger-hint banner and working
    Metrics/Redeploy/Stop/Terminate actions. Proves the core hypothesis:
    zero cross-component signaling needed.
  - ECS: `EcsMonitorControl` under Monitoring correctly listed real
    clusters (including ones created in an earlier, unrelated session)
    with working Tasks/Delete actions.
  - Dashboard: renders correctly under its new Operations → Monitoring
    home, back button correctly labeled "← Monitoring", tabs functional.
  - **A real, pre-existing bug found and fixed along the way (not a
    regression from this split):** `CloudProvisioningControl`'s
    Configure form never captured field values before the confirm-box
    re-render (the exact bug class justjs#148 fixed for EC2/ECS, but
    which was never applied to CloudWatch alarms) - the create-success
    message showed an empty alarm name. Fixed with the same
    `#pendingCreateConfig` pattern EC2/ECS already use; re-verified live,
    now shows the real typed name.
  - **A separate, real, pre-existing bug found (not fixed here, out of
    this ADR's scope, filed as justjs#152):** `cloudWatchCall()` never
    parses CloudEmu's real XML CloudWatch responses (it assumes JSON) -
    confirmed via a raw `fetch()` that CloudEmu always returns
    `text/xml` for CloudWatch actions regardless of the `Accept` header
    sent. This predates justjs#151 entirely (part of the original
    CloudWatch pilot, ADR-0017) and is unrelated to the Deployment/
    Operations split itself - `AlarmMonitorControl`'s own list/delete
    logic is verified correct, it just can't see real data against
    CloudEmu until justjs#152 is fixed.
- **Real on-device verification** (Samsung physical device, real WebView,
  `adb reverse`/`adb forward` + `browse` CLI against the same local
  CloudEmu instance, per the runbook's own established pipeline): rebuilt
  and installed the real APK, confirmed Deployment → Cloud shows the same
  3-tile Configure grid, Operations → Monitoring's "Monitoring" function
  is real (no longer "Coming soon"), launched a real EC2 instance via
  Configure on-device and confirmed it appeared in Operations →
  Monitoring with working Metrics/Redeploy/Terminate - identical behavior
  to the desktop dev-server pass, not just "builds for Android."

## Relates to

- ADR-0017/ADR-0019/ADR-0020 - each described the pre-split, single-screen
  Configure+Monitor shape; all three updated in place with a pointer to
  this ADR rather than rewritten, so their own historical implementation
  evidence stays accurate to what was actually shipped at the time.
- justjs#151 - the tracking issue for this split.
