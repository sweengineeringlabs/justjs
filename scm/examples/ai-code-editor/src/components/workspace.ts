import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo } from "../core/navigation.js";
import { inferLanguage, normalizePath, pathExists } from "../core/fs.js";
import { runCliCommand } from "../core/cli.js";
// Real, official brand marks (CC0, offline - no runtime network call,
// same "no real API calls" posture as the rest of this app) via
// simple-icons, not hand-drawn approximations. AWS/Azure/Heroku aren't
// in simple-icons' catalog at all (its own community has had brands
// pulled over trademark requests in the past) - those three fall back
// to a plain colored monogram instead of a fabricated logo shape, see
// CLOUD_PROVIDER_CATALOG below.
import gcpLogo from "simple-icons/icons/googlecloud.svg?raw";
import digitaloceanLogo from "simple-icons/icons/digitalocean.svg?raw";
import cloudflareLogo from "simple-icons/icons/cloudflare.svg?raw";
import vercelLogo from "simple-icons/icons/vercel.svg?raw";
import netlifyLogo from "simple-icons/icons/netlify.svg?raw";
// GitHub/GitLab/Bitbucket are all in simple-icons' catalog for real
// (unlike AWS/Azure/Heroku above) - no monogram fallback needed for any
// of the 3 SCM providers.
import githubLogo from "simple-icons/icons/github.svg?raw";
import gitlabLogo from "simple-icons/icons/gitlab.svg?raw";
import bitbucketLogo from "simple-icons/icons/bitbucket.svg?raw";
// Linear/Asana/Trello/Jira are all in simple-icons' catalog for real
// too - no monogram fallback needed for any of the 4 PM providers.
import linearLogo from "simple-icons/icons/linear.svg?raw";
import asanaLogo from "simple-icons/icons/asana.svg?raw";
import trelloLogo from "simple-icons/icons/trello.svg?raw";
import jiraLogo from "simple-icons/icons/jira.svg?raw";
import {
  getStoredCloudToken,
  setStoredCloudToken,
  getStoredAwsCredentials,
  setStoredAwsCredentials,
} from "../core/cloud_credentials.js";
import {
  connectDigitalOcean,
  connectNetlify,
  connectVercel,
  connectHeroku,
  connectAzure,
  connectGcp,
  connectAwsIdentity,
  connectAwsInstances,
  deployToNetlify,
  deployToVercel,
  deployToHeroku,
} from "../core/cloud_connect.js";
import { getStoredCloudDeployTarget, setStoredCloudDeployTarget } from "../core/cloud_credentials.js";
import type { CloudDeployFile, CloudDeployResult } from "../core/cloud_connect.js";
import { getStoredScmToken, setStoredScmToken } from "../core/scm_credentials.js";
import { connectGithub, connectGitlab, connectBitbucket } from "../core/scm_connect.js";
import type { ScmResource } from "../core/scm_connect.js";
import type { CloudResource } from "../core/cloud_connect.js";
import {
  getStoredPmToken,
  setStoredPmToken,
  getStoredTrelloCredentials,
  setStoredTrelloCredentials,
  getStoredJiraSession,
  setStoredJiraSession,
  getStoredJiraAppCredentials,
} from "../core/pm_credentials.js";
import { connectLinear, connectAsana, connectTrello, connectJira, beginJiraConnect } from "../core/pm_connect.js";
import type { PmResource } from "../core/pm_connect.js";
import "@justjs/component-view";
import type { BadgeView, GridView, NavHeaderView } from "@justjs/component-view";
import "@justjs/provider-connect";
import type { ProviderCatalogItem, ProviderConnectorControl } from "@justjs/provider-connect";
import "./cli_terminal.js";
import type { CliTerminalControl } from "./cli_terminal.js";
import "./doc_generator_control.js";
import type { DesignGeneratorControl } from "./doc_generator_control.js";
import "./presentation_generator_control.js";
import type { PresentationGeneratorControl } from "./presentation_generator_control.js";

// Real hex values ported from app.css's own [data-stage="..."] rules -
// <view-grid>'s Shadow DOM can't be reached by that light-DOM selector
// (see grid_view.ts's accentColor doc), so each stage's hue now travels
// as real per-item data instead, the same colors unchanged.
const STAGE_COLORS: Record<string, string> = {
  ideation: "#f5a524",
  requirement: "#3b82f6",
  planning: "#14b8a6",
  design: "#a855f7",
  development: "#6366f1",
  testing: "#f43f5e",
  deployment: "#f97316",
  operations: "#06b6d4",
  presentation: "#d946ef",
};

interface SdlcFunction {
  readonly label: string;
  // Present => a real, working link into one of this app's existing
  // tabs. Absent (and no `action` either) => an honestly-labeled "Coming
  // soon" stub, not a fake-functional button - this hub currently ships
  // the widget shell only, not new tooling for every stage.
  readonly route?: string;
  // Present => clicking opens an inline view within this stage's own
  // detail screen (WorkspaceElement's own drill-down), rather than
  // navigating to another tab or showing a stub. "design-generate":
  // Architecture and Wireframes are two distinct entries that both open
  // the same real generateDesignDoc() capability, since one generated
  // Markdown+Mermaid doc genuinely covers what both labels represent
  // (the write-up and the diagram). "cloud-providers": a real,
  // recognizable catalog of actual cloud providers (AWS, Azure, Google
  // Cloud, etc. - see CLOUD_PROVIDER_CATALOG), each with a real connect
  // screen (@justjs/cloud-connect) - a real token/credential pair, sent
  // directly to that provider, same security posture as the Anthropic
  // key. "scm-connect": the source-control equivalent
  // (@justjs/scm-connect) - GitHub/GitLab/Bitbucket, see
  // SCM_PROVIDER_CATALOG, same connect-screen shape as "cloud-providers"
  // minus AWS's two-field/signing special case (all 3 SCM providers are
  // single-bearer-token). "presentation-generate": a real
  // generateSlides() capability, opened directly by Presentation's one
  // function (same shape as "cloud-providers"/"scm-connect" - a single
  // real function opening an inline view - not "design-generate"'s
  // two-entries-share-one-generator shape). "cli": a real terminal
  // running commands against this app's own virtual filesystem
  // (core/cli.ts) - not an AI-backed interpreter, and not a real OS
  // shell (this app is browser-only, no backend to shell out to). Same
  // single-real-function shape as "cloud-providers"/"scm-connect".
  // "pm-connect": the project-management equivalent
  // (@justjs/pm-connect) - Linear/Asana/Trello/Jira, see
  // PM_PROVIDER_CATALOG - the one action shared across *two* different
  // stages (Requirement's "Specs"/"User Stories" and Planning's new
  // "Project Boards"), same one-real-capability-many-entries shape
  // "design-generate" already established within a single stage.
  readonly action?: "design-generate" | "cloud-providers" | "scm-connect" | "presentation-generate" | "cli" | "pm-connect";
}

interface SdlcStage {
  readonly key: string;
  readonly label: string;
  readonly icon: string;
  readonly functions: readonly SdlcFunction[];
}

interface CloudProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  // Each provider's real, recognizable brand color (not an arbitrary
  // palette pick) - used for the badge background regardless of
  // whether a real `logo` SVG is available.
  readonly color: string;
  // Raw SVG markup (simple-icons, single <path>, no fill set) for the
  // 5 providers actually in that catalog. Recolored to white via a
  // `fill="currentColor"` injection at render time (renderCloudProviders
  // below) so it reads clearly against its own colored badge. Absent
  // for aws/azure/heroku - those render their emoji `icon` instead, not
  // a fabricated logo.
  readonly logo?: string;
  // "bearer" - a single pasted token, sent as `Authorization: Bearer`,
  // same posture as ai_assist.ts's Anthropic key. "aws" - two fields
  // (access key ID + secret) and real SigV4 request signing
  // (core/aws_sigv4.ts) - AWS's own docs are explicit that CORS support
  // doesn't remove the signing requirement. "unsupported" - Cloudflare's
  // API did not return CORS headers when checked live; connecting
  // directly from a browser isn't confirmed possible, so this stays an
  // honest "not available" state rather than a connect form that might
  // silently fail.
  readonly kind: "bearer" | "aws" | "unsupported";
  // Real command the user runs locally to get a token - only Azure/GCP
  // need this (a short-lived CLI-issued token, not a full OAuth-in-SPA
  // flow - see cloud_connect.ts's comments for why). Shown verbatim in
  // the connect form, along with the token's real expiry.
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  // Netlify/Vercel/Heroku only: a real, direct-from-browser "Deploy this
  // project" action is available (@justjs/cloud-connect's own optional
  // deploy() capability) - orthogonal to `kind` (all 3 stay "bearer"),
  // same reasoning AWS's listInstances-only capability already
  // established: an extra opt-in action, not a new provider `kind`.
  readonly supportsDeploy?: boolean;
}

// A real, recognizable set of actual cloud providers - not arbitrary
// user-typed strings. 6 of 7 connectable providers use a pasted bearer
// token (same security posture as the existing Anthropic key); AWS
// needs real request signing instead (see core/aws_sigv4.ts); Cloudflare
// stays local-list-only (no confirmed CORS access - see `kind` above).
const CLOUD_PROVIDER_CATALOG: readonly CloudProvider[] = [
  { id: "aws", name: "AWS", icon: "🟧", color: "#FF9900", kind: "aws" },
  { id: "gcp", name: "Google Cloud", icon: "🔴", color: "#4285F4", logo: gcpLogo, kind: "bearer", tokenHint: { command: "gcloud auth print-access-token", expiry: "~1 hour" } },
  { id: "azure", name: "Microsoft Azure", icon: "🔷", color: "#0078D4", kind: "bearer", tokenHint: { command: "az account get-access-token --query accessToken -o tsv", expiry: "~60-90 minutes" } },
  { id: "digitalocean", name: "DigitalOcean", icon: "💧", color: "#0080FF", logo: digitaloceanLogo, kind: "bearer" },
  { id: "cloudflare", name: "Cloudflare", icon: "🟠", color: "#F38020", logo: cloudflareLogo, kind: "unsupported" },
  { id: "vercel", name: "Vercel", icon: "▲", color: "#000000", logo: vercelLogo, kind: "bearer", supportsDeploy: true },
  { id: "netlify", name: "Netlify", icon: "🟢", color: "#00C7B7", logo: netlifyLogo, kind: "bearer", supportsDeploy: true },
  { id: "heroku", name: "Heroku", icon: "🟣", color: "#430098", kind: "bearer", supportsDeploy: true },
];

const CLOUD_DEPLOYERS: Record<string, (token: string, files: readonly CloudDeployFile[], existingTargetId?: string) => Promise<CloudDeployResult>> = {
  netlify: deployToNetlify,
  vercel: deployToVercel,
  heroku: deployToHeroku,
};

const BEARER_CONNECTORS: Record<string, (token: string) => Promise<CloudResource[]>> = {
  gcp: connectGcp,
  azure: connectAzure,
  digitalocean: connectDigitalOcean,
  vercel: connectVercel,
  netlify: connectNetlify,
  heroku: connectHeroku,
};

interface ScmProvider {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly logo: string;
}

// A real, recognizable set of actual source-control providers - all 3
// are in simple-icons' catalog for real, so no emoji-monogram fallback
// is needed here (unlike CLOUD_PROVIDER_CATALOG's AWS/Azure/Heroku
// gap). All 3 use a single pasted bearer token (a real Personal Access
// Token), same posture as the Anthropic key.
const SCM_PROVIDER_CATALOG: readonly ScmProvider[] = [
  { id: "github", name: "GitHub", color: "#181717", logo: githubLogo },
  { id: "gitlab", name: "GitLab", color: "#FC6D26", logo: gitlabLogo },
  { id: "bitbucket", name: "Bitbucket", color: "#0052CC", logo: bitbucketLogo },
];

const SCM_CONNECTORS: Record<string, (token: string) => Promise<ScmResource[]>> = {
  github: connectGithub,
  gitlab: connectGitlab,
  bitbucket: connectBitbucket,
};

// <control-provider-connector> (@justjs/provider-connect, justjs#97)
// covers this exact "provider grid -> single bearer-token form ->
// resource list" shape with zero extension needed - confirmed during
// justjs#124's real migration, not assumed. ScmResource{id,name,status}
// already matches ListItem's shape exactly (deliberately, see
// scm-connect's own provider.ts comment), so list() below is a pure
// cast, same as socials.ts's own real usage.
function toScmCatalogItem(p: ScmProvider): ProviderCatalogItem {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    logo: p.logo,
    connected: getStoredScmToken(p.id).length > 0,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
    resourceListLabel: "Repositories",
  };
}

async function handleScmConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<ScmResource[]> {
  const provider = SCM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const token = (values["token"] ?? "").trim() || getStoredScmToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await SCM_CONNECTORS[providerId]!(token);
  setStoredScmToken(providerId, token);
  return resources;
}

function handleScmDisconnect(providerId: string): void {
  setStoredScmToken(providerId, "");
}

interface PmProvider {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly logo: string;
  // "bearer" - Linear/Asana's single pasted token (Linear's own header
  // convention omits the "Bearer" prefix entirely - real, handled
  // inside @justjs/pm-connect, not a UI concern). "keytoken" - Trello's
  // real 2-field API key + token (sent as query params, not a header -
  // also handled inside the package). "oauth" - Jira's real OAuth 2.0
  // redirect flow: the connect screen collects the user's own Atlassian
  // OAuth app Client ID + Secret (never hardcoded/shipped in this app -
  // same bring-your-own-app-credentials posture Reddit's own connect
  // screen already established), and "Connect" navigates the real
  // browser to Atlassian's consent screen rather than resolving in
  // place like every other provider here.
  readonly kind: "bearer" | "keytoken" | "oauth";
}

// A real, recognizable set of actual project-management providers -
// all 4 are in simple-icons' catalog for real. Notion (confirmed no
// CORS support at all when checked live) isn't offered here even as an
// honest "not available" card - unlike Cloudflare/X/LinkedIn elsewhere,
// it was never in the confirmed provider set this feature shipped with.
const PM_PROVIDER_CATALOG: readonly PmProvider[] = [
  { id: "linear", name: "Linear", color: "#5E6AD2", logo: linearLogo, kind: "bearer" },
  { id: "asana", name: "Asana", color: "#F06A6A", logo: asanaLogo, kind: "bearer" },
  { id: "trello", name: "Trello", color: "#0052CC", logo: trelloLogo, kind: "keytoken" },
  { id: "jira", name: "Jira", color: "#0052CC", logo: jiraLogo, kind: "oauth" },
];

const PM_CONNECTORS: Record<string, (token: string) => Promise<PmResource[]>> = {
  linear: connectLinear,
  asana: connectAsana,
};

function setBadgeProps(el: Element | null, p: { readonly icon?: string; readonly color: string; readonly logo?: string }): void {
  const badge = el as BadgeView | null;
  if (!badge) {
    return;
  }
  badge.color = p.color;
  if (p.icon !== undefined) {
    badge.icon = p.icon;
  }
  if (p.logo !== undefined) {
    badge.logo = p.logo;
  }
}

// Development -> Editor, Testing -> Review, Ideation -> Chat, and
// Planning -> Scaffold are real links into this app's existing tabs -
// each the natural fit for that stage (scaffolding a new file/project
// IS a planning activity; an AI code review IS a testing activity;
// brainstorming with Chat IS ideation). Design's Architecture and
// Wireframes are both real (not stubs) - both open the same inline
// Markdown+Mermaid generator (renderDesignGenerator() below), since one
// generated doc covers both. Development's CLI is also real (not a
// stub) - a real terminal against this app's own virtual filesystem
// (renderCliTerminal() below). Development's Repository is also real
// (not a stub, no longer "Git" under Deployment - moved here, since a
// repository is a development-stage concern) - a real connect screen
// (@justjs/scm-connect) for GitHub/GitLab/Bitbucket
// (renderScmProviders() below).
// Deployment's Cloud is also real - a real connect screen
// (@justjs/cloud-connect) for actual cloud providers
// (renderCloudProviders() below). Requirement's Specs/User Stories and
// Planning's Project Boards are also real (not stubs) - all 3 open the
// same real connect screen (@justjs/pm-connect) for Linear/Asana/
// Trello/Jira (renderPmProviders() below), the same one-real-capability-
// shared-across-multiple-entries shape Design's Architecture/Wireframes
// already established, just spanning two different stages instead of
// one. Presentation is a 9th widget appended after the 8 SDLC stages -
// it isn't itself an SDLC stage, but the user asked for it alongside
// them, so it lives in the same overview grid. Its one function,
// Slides, is real (not a stub) - a real generateSlides() capability
// (renderPresentationGenerator() below).
const SDLC_STAGES: readonly SdlcStage[] = [
  { key: "ideation", label: "Ideation", icon: "💡", functions: [{ label: "Chat", route: "/chat" }] },
  { key: "requirement", label: "Requirement", icon: "📋", functions: [{ label: "Specs", action: "pm-connect" }, { label: "User Stories", action: "pm-connect" }] },
  { key: "planning", label: "Planning", icon: "🗺️", functions: [{ label: "Scaffold", route: "/scaffold" }, { label: "Project Boards", action: "pm-connect" }] },
  {
    key: "design",
    label: "Design",
    icon: "🎨",
    functions: [
      { label: "Architecture", action: "design-generate" },
      { label: "Wireframes", action: "design-generate" },
    ],
  },
  {
    key: "development",
    label: "Development",
    icon: "💻",
    functions: [{ label: "Editor", route: "/editor" }, { label: "CLI", action: "cli" }, { label: "Repository", action: "scm-connect" }],
  },
  { key: "testing", label: "Testing", icon: "🧪", functions: [{ label: "Review", route: "/review" }] },
  {
    key: "deployment",
    label: "Deployment",
    icon: "🚀",
    functions: [{ label: "Cloud", action: "cloud-providers" }],
  },
  { key: "operations", label: "Operations", icon: "📈", functions: [{ label: "Monitoring" }, { label: "Logs" }] },
  {
    key: "presentation",
    label: "Presentation",
    icon: "📽️",
    functions: [{ label: "Slides", action: "presentation-generate" }],
  },
];

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// The SDLC hub: a 9-widget overview (8 SDLC stages plus Presentation),
// drilling into each stage's function list on tap - same
// widget-grid-then-drill-down architecture agentic-memory-demo's
// dashboard.ts established. Design, Development's CLI, Deployment's
// Cloud, and Presentation's Slides are the stages with real, inline
// functionality (a Markdown+Mermaid design-doc generator; a real
// virtual-filesystem terminal; a real cloud-provider catalog to toggle
// on/off; an AI-generated slide deck) rather than a link elsewhere or a
// stub.
export class WorkspaceElement extends HTMLElement {
  private store?: FeatureStore<AppState, AppAction>;
  private currentStageKey: string | null = null;

  // Design-stage generator - extracted into <control-design-generator>
  // (justjs#123). Description/doc/viewMode/render-token now live on
  // that element itself; cached in designGenerator so the same
  // instance (and its in-progress doc) survives leaving and
  // re-entering via either Architecture or Wireframes - same
  // persistence semantics as the original's own component-local
  // fields, matching CliTerminalControl's cliTerminal caching
  // (justjs#122).
  private designGenerator: DesignGeneratorControl | undefined;
  // Design has three drill-down levels (Workspace -> Design's own
  // Architecture/Wireframes list -> the shared generator), one more than
  // every other stage's two (Workspace -> function list). This flag is
  // the third level's on/off switch.
  private showDesignGenerator = false;

  // Deployment's Cloud providers - a real, recognizable catalog (see
  // CLOUD_PROVIDER_CATALOG). Real connections now: a real token/
  // credential pair persists via core/cloud_credentials.ts (localStorage,
  // same posture as the Anthropic key); the fetched resource list itself
  // is component-local and re-fetched per visit, not cached.
  private showCloudProviders = false;
  // Which provider's own connect/detail view is open - a 4th drill-down
  // level (Workspace -> Deployment -> Cloud Providers grid -> this).
  private selectedCloudProviderId: string | null = null;
  private cloudResources: CloudResource[] | null = null;
  private cloudConnectError: string | null = null;
  private cloudConnecting = false;
  // AWS DescribeInstances is a separate, opt-in call after
  // GetCallerIdentity succeeds (see cloud_connect.ts) - needs the real
  // ec2:DescribeInstances permission, unlike GetCallerIdentity.
  private awsInstances: CloudResource[] | null = null;
  private awsInstancesError: string | null = null;
  private awsInstancesLoading = false;
  // Real "Deploy this project" action (Netlify/Vercel/Heroku only) -
  // same separate, opt-in-after-a-successful-connect shape as AWS's
  // List EC2 Instances above. cloudDeployResult holds the real live
  // URL a successful deploy resolves to.
  private cloudDeployResult: CloudDeployResult | null = null;
  private cloudDeployError: string | null = null;
  private cloudDeploying = false;

  // Development's Repository - migrated onto <control-provider-connector>
  // (justjs#124), which owns which-provider-is-selected/fetched-resources
  // state internally. scmScreen caches the whole composed wrapper (header
  // + hint + connector) so that state (and grid<->detail position)
  // survives leaving and re-entering Repository within Development, and
  // across tab switches - but the control has no public reset API, so
  // renderOverview's item-select handler below discards this reference
  // entirely (forcing a fresh instance next visit) to preserve the
  // original's own reset-on-stage-switch behavior for
  // selectedScmProviderId/scmResources.
  private showScmConnect = false;
  private scmScreen: HTMLElement | undefined;

  // Requirement's/Planning's project-management connections - the same
  // shape as Cloud's/SCM's own state above, shared across both stages
  // since it's one real capability (see PM_PROVIDER_CATALOG), not two
  // separate ones.
  private showPmConnect = false;
  private selectedPmProviderId: string | null = null;
  private pmResources: PmResource[] | null = null;
  private pmConnectError: string | null = null;
  private pmConnecting = false;

  // Presentation-stage generator - extracted into
  // <control-presentation-generator> (justjs#123), same caching
  // reasoning as designGenerator above.
  private presentationGenerator: PresentationGeneratorControl | undefined;
  private showPresentationGenerator = false;

  // Development's CLI - a real terminal against this app's own virtual
  // filesystem (core/cli.ts), extracted into <control-cli-terminal>
  // (justjs#122). cwd/history now live on that element itself, not
  // here - cached in cliTerminal so the same instance (and its state)
  // survives leaving and re-entering the CLI sub-screen, matching the
  // original's own persistence (cliCwd/cliHistory were deliberately
  // never reset by renderOverview's item-select handler below, and
  // deliberately uncoupled from AppState.activeFilePath).
  private cliTerminal: CliTerminalControl | undefined;
  private showCliTerminal = false;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.store = ctx?.store;
  }

  connectedCallback(): void {
    this.innerHTML = `<div id="workspace-view"></div>`;
    this.renderView();
  }

  private renderView(): void {
    const container = this.querySelector("#workspace-view");
    if (!container) {
      return;
    }
    const stage = SDLC_STAGES.find((s) => s.key === this.currentStageKey);
    if (!stage) {
      this.renderOverview(container);
      return;
    }
    this.renderStage(container, stage);
  }

  private renderOverview(container: Element): void {
    // Clears whatever a previous drill-down's renderStage() set - the
    // overview grid colors each widget individually, not the container.
    container.removeAttribute("data-stage");
    container.innerHTML = `<view-grid id="workspace-overview-grid"></view-grid>`;
    const grid = container.querySelector<GridView>("#workspace-overview-grid")!;
    grid.items = SDLC_STAGES.map((s) => ({
      id: s.key,
      label: s.label,
      icon: s.icon,
      accentColor: STAGE_COLORS[s.key],
    }));
    grid.addEventListener("item-select", (e) => {
      this.currentStageKey = (e as CustomEvent<{ id: string }>).detail.id;
      // Always start a freshly-entered stage at its function list, not
      // mid-generator/mid-provider-list from a previous visit.
      this.showDesignGenerator = false;
      this.showCloudProviders = false;
      this.selectedCloudProviderId = null;
      this.cloudResources = null;
      this.cloudConnectError = null;
      this.awsInstances = null;
      this.awsInstancesError = null;
      this.cloudDeployResult = null;
      this.cloudDeployError = null;
      this.showScmConnect = false;
      // No public reset API on ProviderConnectorControl - discarding the
      // cached wrapper is the only way to force a fresh grid view
      // (matches the original's own explicit selectedScmProviderId/
      // scmResources reset here).
      this.scmScreen = undefined;
      this.showPmConnect = false;
      this.selectedPmProviderId = null;
      this.pmResources = null;
      this.pmConnectError = null;
      this.showPresentationGenerator = false;
      this.showCliTerminal = false;
      this.renderView();
    });
  }

  private renderStage(container: Element, stage: SdlcStage): void {
    // Lets the drill-down (function list + every special sub-view -
    // Design's generator, Cloud, Presentation's generator, the CLI)
    // inherit the same --stage-color the overview grid's widget already
    // set per stage (app.css's [data-stage="..."] rules), instead of
    // falling back to flat var(--surface) once you're inside a stage.
    container.setAttribute("data-stage", stage.key);
    if (stage.key === "design" && this.showDesignGenerator) {
      this.renderDesignGenerator(container);
      return;
    }
    if (stage.key === "deployment" && this.showCloudProviders) {
      this.renderCloudProviders(container);
      return;
    }
    if (stage.key === "presentation" && this.showPresentationGenerator) {
      this.renderPresentationGenerator(container);
      return;
    }
    if (stage.key === "development" && this.showCliTerminal) {
      this.renderCliTerminal(container);
      return;
    }
    if (stage.key === "development" && this.showScmConnect) {
      this.renderScmProviders(container);
      return;
    }
    if ((stage.key === "requirement" || stage.key === "planning") && this.showPmConnect) {
      this.renderPmProviders(container, stage);
      return;
    }
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Workspace</button>
        <h2 class="workspace-stage-title">${stage.icon} ${escapeHtml(stage.label)}</h2>
      </div>
      <div class="workspace-function-list">
        ${stage.functions
          .map((f) => {
            if (f.action) {
              return `
                <button class="workspace-function workspace-function-live" data-action="${f.action}" type="button">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-arrow">→</span>
                </button>
              `;
            }
            return f.route
              ? `
                <button class="workspace-function workspace-function-live" data-route="${f.route}" type="button">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-arrow">→</span>
                </button>
              `
              : `
                <div class="workspace-function workspace-function-stub">
                  <span class="workspace-function-label">${escapeHtml(f.label)}</span>
                  <span class="workspace-function-badge">Coming soon</span>
                </div>
              `;
          })
          .join("")}
      </div>
    `;
    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      this.currentStageKey = null;
      this.renderView();
    });
    container.querySelectorAll<HTMLButtonElement>(".workspace-function-live[data-route]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const route = btn.dataset.route;
        if (route) {
          navigateTo(route);
        }
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="design-generate"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showDesignGenerator = true;
        this.renderView();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="cloud-providers"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showCloudProviders = true;
        this.renderView();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="scm-connect"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showScmConnect = true;
        this.renderView();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="pm-connect"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showPmConnect = true;
        this.renderView();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="presentation-generate"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showPresentationGenerator = true;
        this.renderView();
      });
    });
    container.querySelectorAll<HTMLButtonElement>('.workspace-function-live[data-action="cli"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showCliTerminal = true;
        this.renderView();
      });
    });
  }

  // ---- Design: Markdown + Mermaid doc generator (opened from either
  // Architecture or Wireframes above) ----

  private renderDesignGenerator(container: Element): void {
    container.innerHTML = "";
    if (!this.designGenerator) {
      const generator = document.createElement("control-design-generator") as DesignGeneratorControl;
      generator.generate = async (description) => {
        const provider = getAiAssistProvider();
        if (!provider) {
          throw new Error("Add an Anthropic API key in Settings to generate a design doc.");
        }
        return provider.generateDesignDoc({ description });
      };
      generator.createFile = (rawPath, content) => {
        if (!this.store) {
          return { ok: false, error: "Couldn't create the file." };
        }
        const path = normalizePath(rawPath);
        if (!path) {
          return { ok: false, error: "Enter a path before creating the file." };
        }
        const state = this.store.state.value;
        if (pathExists(state.files, state.emptyFolders, path)) {
          return { ok: false, error: `"${path}" already exists - choose a different path.` };
        }
        this.store.dispatch({ type: "CREATE_FILE", path, content, language: inferLanguage(path) });
        navigateTo("/editor");
        return { ok: true };
      };
      generator.addEventListener("back", () => {
        // One level back - to Design's own Architecture/Wireframes list,
        // not all the way out to the Workspace overview (that back
        // button, in the generic function-list view above, handles
        // that level).
        this.showDesignGenerator = false;
        this.renderView();
      });
      this.designGenerator = generator;
    }
    container.appendChild(this.designGenerator);
  }

  // ---- Deployment: Cloud providers (opened from Cloud above) ----

  private isCloudProviderConnected(p: CloudProvider): boolean {
    return p.kind === "aws" ? getStoredAwsCredentials() !== null : getStoredCloudToken(p.id).length > 0;
  }

  private renderCloudProviders(container: Element): void {
    if (this.selectedCloudProviderId) {
      const provider = CLOUD_PROVIDER_CATALOG.find((p) => p.id === this.selectedCloudProviderId);
      if (provider) {
        this.renderCloudProviderDetail(container, provider);
        return;
      }
      this.selectedCloudProviderId = null;
    }

    container.innerHTML = `
      <div class="dash-subnav">
        <button id="cloud-back-btn" class="dash-back-btn" type="button">← Deployment</button>
        <h2 class="workspace-stage-title">🚀 Cloud Providers</h2>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual resources. Tokens/credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none). See each provider's own connect screen for the exact security tradeoff.</p>
      <div class="provider-grid">
        ${CLOUD_PROVIDER_CATALOG.map((p) => {
          const connected = this.isCloudProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-provider-id="${p.id}">
              <view-badge data-badge-for="${p.id}"></view-badge>
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelector("#cloud-back-btn")?.addEventListener("click", () => {
      // One level back - to Deployment's own function list, not all the
      // way out to the Workspace overview.
      this.showCloudProviders = false;
      this.renderView();
    });

    container.querySelectorAll<HTMLButtonElement>("[data-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.providerId;
        if (!id) {
          return;
        }
        this.selectedCloudProviderId = id;
        this.cloudResources = null;
        this.cloudConnectError = null;
        this.awsInstances = null;
        this.awsInstancesError = null;
        this.cloudDeployResult = null;
        this.cloudDeployError = null;
        this.renderView();
      });
    });
    container.querySelectorAll<Element>("view-badge[data-badge-for]").forEach((el) => {
      const provider = CLOUD_PROVIDER_CATALOG.find((p) => p.id === (el as HTMLElement).dataset.badgeFor);
      if (provider) {
        setBadgeProps(el, provider);
      }
    });
  }

  // ---- Deployment: a single provider's own connect screen (opened from the grid above) ----

  private renderCloudProviderDetail(container: Element, provider: CloudProvider): void {
    const connected = this.isCloudProviderConnected(provider);
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="cloud-provider-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
        <h2 class="workspace-stage-title"><view-badge id="cloud-header-badge"></view-badge> ${escapeHtml(provider.name)}</h2>
      </div>
      ${this.renderCloudProviderBody(provider, connected)}
    `;
    setBadgeProps(container.querySelector("#cloud-header-badge"), provider);

    this.querySelector("#cloud-provider-back-btn")?.addEventListener("click", () => {
      this.selectedCloudProviderId = null;
      this.renderView();
    });

    if (provider.kind === "unsupported") {
      return;
    }

    this.querySelector("#cloud-connect-btn")?.addEventListener("click", () => {
      void this.handleCloudConnect(provider);
    });
    this.querySelector("#cloud-disconnect-btn")?.addEventListener("click", () => {
      if (provider.kind === "aws") {
        setStoredAwsCredentials(null);
      } else {
        setStoredCloudToken(provider.id, "");
      }
      this.cloudResources = null;
      this.cloudConnectError = null;
      this.awsInstances = null;
      this.awsInstancesError = null;
      this.cloudDeployResult = null;
      this.cloudDeployError = null;
      this.renderView();
    });
    this.querySelector("#aws-list-instances-btn")?.addEventListener("click", () => {
      void this.handleAwsListInstances();
    });
    this.querySelector("#cloud-deploy-btn")?.addEventListener("click", () => {
      void this.handleCloudDeploy(provider);
    });

    // Already connected (a token/credential pair was saved in a
    // previous session) and nothing fetched yet this visit - fetch
    // automatically rather than making the user re-click Connect for a
    // credential that's already there. Mirrors ai_assist.ts's own
    // "re-reads localStorage on every call" lazy-validation posture.
    if (connected && !this.cloudResources && !this.cloudConnectError && !this.cloudConnecting) {
      void this.handleCloudConnect(provider);
    }
  }

  private renderCloudProviderBody(provider: CloudProvider, connected: boolean): string {
    if (provider.kind === "unsupported") {
      return `
        <p class="connect-hint">⚠️ ${escapeHtml(provider.name)}'s API did not return CORS headers when checked directly from a browser - connecting here isn't confirmed possible without a backend proxy, which this app doesn't have. Left as a local-list-only entry rather than a connect form that might silently fail.</p>
      `;
    }

    const disclosure =
      provider.kind === "aws"
        ? `Stored only on this device. Signed (AWS SigV4) and sent directly to AWS when you connect - never proxied. AWS's own guidance: prefer short-lived/temporary credentials over a long-term access key pair like this one; only paste a key you're comfortable having live in browser storage.`
        : `Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.`;

    const tokenHint = provider.tokenHint
      ? `<p class="connect-hint">Get a real token: <code>${escapeHtml(provider.tokenHint.command)}</code> - expires in ${escapeHtml(provider.tokenHint.expiry)}, re-run and reconnect once it does.</p>`
      : "";

    const form =
      provider.kind === "aws"
        ? `
          <input id="cloud-connect-access-key" type="text" placeholder="AWS access key ID" autocomplete="off" spellcheck="false" />
          <input id="cloud-connect-secret-key" type="password" placeholder="AWS secret access key" autocomplete="off" spellcheck="false" />
        `
        : `<input id="cloud-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} token" autocomplete="off" spellcheck="false" />`;

    return `
      <p class="settings-disclosure">${disclosure}</p>
      ${tokenHint}
      <div class="connect-form">
        ${form}
        <div class="connect-actions">
          <button id="cloud-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="cloud-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="cloud-connect-status" class="connect-status${this.cloudConnectError ? " connect-status-error" : ""}">${this.cloudConnecting ? "Connecting…" : this.cloudConnectError ? `⚠️ ${escapeHtml(this.cloudConnectError)}` : ""}</p>
      </div>
      ${this.renderCloudResourceList(provider)}
    `;
  }

  private renderCloudResourceList(provider: CloudProvider): string {
    if (!this.cloudResources) {
      return "";
    }
    const listLabel = provider.kind === "aws" ? "Identity" : "Resources";
    const rows =
      this.cloudResources.length === 0
        ? `<p class="connect-hint">Connected - no resources found on this account.</p>`
        : `<ul class="resource-list">
            ${this.cloudResources
              .map(
                (r) => `
                  <li class="resource-row">
                    <span class="resource-name">${escapeHtml(r.name)}</span>
                    <span class="resource-status">${escapeHtml(r.status)}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>`;
    const awsInstancesSection =
      provider.kind === "aws"
        ? `
          <div class="connect-actions">
            <button id="aws-list-instances-btn" type="button" class="btn-secondary">${this.awsInstancesLoading ? "Loading…" : "List EC2 Instances (needs ec2:DescribeInstances)"}</button>
          </div>
          <p class="connect-status${this.awsInstancesError ? " connect-status-error" : ""}">${this.awsInstancesError ? `⚠️ ${escapeHtml(this.awsInstancesError)}` : ""}</p>
          ${
            this.awsInstances
              ? this.awsInstances.length === 0
                ? `<p class="connect-hint">No EC2 instances found in us-east-1.</p>`
                : `<ul class="resource-list">
                    ${this.awsInstances
                      .map(
                        (r) => `
                          <li class="resource-row">
                            <span class="resource-name">${escapeHtml(r.name)}</span>
                            <span class="resource-status">${escapeHtml(r.status)}</span>
                          </li>
                        `,
                      )
                      .join("")}
                  </ul>`
                : ""
          }
        `
        : "";
    const deploySection = provider.supportsDeploy
      ? `
          <div class="connect-actions">
            <button id="cloud-deploy-btn" type="button" class="btn-secondary">${this.cloudDeploying ? "Deploying…" : "Deploy this project"}</button>
          </div>
          <p class="connect-status${this.cloudDeployError ? " connect-status-error" : ""}">${this.cloudDeployError ? `⚠️ ${escapeHtml(this.cloudDeployError)}` : ""}</p>
          ${
            this.cloudDeployResult
              ? `<p class="connect-hint">✓ Deployed - <a href="${escapeHtml(this.cloudDeployResult.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(this.cloudDeployResult.url)}</a></p>`
              : ""
          }
        `
      : "";
    return `<h3 class="resource-list-label">${listLabel}</h3>${rows}${awsInstancesSection}${deploySection}`;
  }

  private async handleCloudConnect(provider: CloudProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#cloud-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#cloud-connect-btn");

    let awsCreds: { accessKeyId: string; secretAccessKey: string } | null = null;
    let token = "";
    if (provider.kind === "aws") {
      const accessKeyInput = this.querySelector<HTMLInputElement>("#cloud-connect-access-key");
      const secretKeyInput = this.querySelector<HTMLInputElement>("#cloud-connect-secret-key");
      const accessKeyId = accessKeyInput?.value.trim() || getStoredAwsCredentials()?.accessKeyId || "";
      const secretAccessKey = secretKeyInput?.value.trim() || getStoredAwsCredentials()?.secretAccessKey || "";
      if (!accessKeyId || !secretAccessKey) {
        this.cloudConnectError = "Enter both the access key ID and secret access key.";
        this.renderView();
        return;
      }
      awsCreds = { accessKeyId, secretAccessKey };
    } else {
      const tokenInput = this.querySelector<HTMLInputElement>("#cloud-connect-token");
      token = tokenInput?.value.trim() || getStoredCloudToken(provider.id);
      if (!token) {
        this.cloudConnectError = "Paste a token first.";
        this.renderView();
        return;
      }
    }

    this.cloudConnecting = true;
    this.cloudConnectError = null;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Connecting…";
    }
    try {
      const resources =
        provider.kind === "aws" && awsCreds
          ? await connectAwsIdentity(awsCreds.accessKeyId, awsCreds.secretAccessKey)
          : await BEARER_CONNECTORS[provider.id](token);
      if (provider.kind === "aws" && awsCreds) {
        setStoredAwsCredentials(awsCreds);
      } else {
        setStoredCloudToken(provider.id, token);
      }
      this.cloudResources = resources;
      this.cloudConnectError = null;
    } catch (e) {
      this.cloudConnectError = e instanceof Error ? e.message : String(e);
      this.cloudResources = null;
    } finally {
      this.cloudConnecting = false;
      this.renderView();
    }
  }

  private async handleAwsListInstances(): Promise<void> {
    const creds = getStoredAwsCredentials();
    if (!creds) {
      return;
    }
    this.awsInstancesLoading = true;
    this.awsInstancesError = null;
    this.renderView();
    try {
      this.awsInstances = await connectAwsInstances(creds.accessKeyId, creds.secretAccessKey);
    } catch (e) {
      this.awsInstancesError = e instanceof Error ? e.message : String(e);
      this.awsInstances = null;
    } finally {
      this.awsInstancesLoading = false;
      this.renderView();
    }
  }

  private async handleCloudDeploy(provider: CloudProvider): Promise<void> {
    if (!this.store) {
      return;
    }
    this.cloudDeploying = true;
    this.cloudDeployError = null;
    this.renderView();
    try {
      const files = Object.entries(this.store.state.value.files).map(([path, node]) => ({ path, content: node.content }));
      const token = getStoredCloudToken(provider.id);
      const existingTargetId = getStoredCloudDeployTarget(provider.id);
      const result = await CLOUD_DEPLOYERS[provider.id]!(token, files, existingTargetId ?? undefined);
      setStoredCloudDeployTarget(provider.id, result.targetId);
      this.cloudDeployResult = result;
      this.cloudDeployError = null;
    } catch (e) {
      this.cloudDeployError = e instanceof Error ? e.message : String(e);
      this.cloudDeployResult = null;
    } finally {
      this.cloudDeploying = false;
      this.renderView();
    }
  }

  // ---- Development: source-control connections (opened from Repository
  // above) - migrated onto <control-provider-connector> (justjs#124):
  // single bearer-token field, no extra actions beyond connect/list/
  // disconnect, a clean fit with zero package extension. ----

  private renderScmProviders(container: Element): void {
    container.innerHTML = "";
    if (!this.scmScreen) {
      const screen = document.createElement("div");
      screen.innerHTML = `
        <view-nav-header id="scm-header"></view-nav-header>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual repositories. Tokens are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-provider-connector id="scm-connector"></control-provider-connector>
      `;
      const header = screen.querySelector<NavHeaderView>("#scm-header")!;
      // icon/title are private-field-backed accessors on NavHeaderView,
      // not reflected HTML attributes - must be set via JS property
      // assignment, not inline in the template string above (real bug
      // caught while writing this migration, fixed in cli_terminal.ts/
      // doc_generator_control.ts too).
      header.icon = "📦";
      header.title = "Repository";
      header.backLabel = "Development";
      header.addEventListener("nav-back", () => {
        this.showScmConnect = false;
        this.renderView();
      });
      const connector = screen.querySelector<ProviderConnectorControl>("#scm-connector")!;
      connector.providers = SCM_PROVIDER_CATALOG.map(toScmCatalogItem);
      connector.connect = handleScmConnect;
      connector.list = async (_providerId, session) => session as ScmResource[];
      connector.disconnect = handleScmDisconnect;
      connector.catalogLabel = "Repository";
      this.scmScreen = screen;
    }
    container.appendChild(this.scmScreen);
  }

  // ---- Requirement/Planning: project-management connections (opened
  // from Specs/User Stories/Project Boards above) ----

  private isPmProviderConnected(p: PmProvider): boolean {
    if (p.kind === "keytoken") {
      return getStoredTrelloCredentials() !== null;
    }
    if (p.kind === "oauth") {
      return getStoredJiraSession() !== null;
    }
    return getStoredPmToken(p.id).length > 0;
  }

  private renderPmProviders(container: Element, stage: SdlcStage): void {
    if (this.selectedPmProviderId) {
      const provider = PM_PROVIDER_CATALOG.find((p) => p.id === this.selectedPmProviderId);
      if (provider) {
        this.renderPmProviderDetail(container, provider);
        return;
      }
      this.selectedPmProviderId = null;
    }

    container.innerHTML = `
      <div class="dash-subnav">
        <button id="pm-back-btn" class="dash-back-btn" type="button">← ${escapeHtml(stage.label)}</button>
        <h2 class="workspace-stage-title">📋 Project Management</h2>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual issues/tasks/boards. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
      <div class="provider-grid">
        ${PM_PROVIDER_CATALOG.map((p) => {
          const connected = this.isPmProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-pm-provider-id="${p.id}">
              <view-badge data-badge-for="${p.id}"></view-badge>
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelector("#pm-back-btn")?.addEventListener("click", () => {
      this.showPmConnect = false;
      this.renderView();
    });

    container.querySelectorAll<HTMLButtonElement>("[data-pm-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.pmProviderId;
        if (!id) {
          return;
        }
        this.selectedPmProviderId = id;
        this.pmResources = null;
        this.pmConnectError = null;
        this.renderView();
      });
    });
    container.querySelectorAll<Element>("view-badge[data-badge-for]").forEach((el) => {
      const provider = PM_PROVIDER_CATALOG.find((p) => p.id === (el as HTMLElement).dataset.badgeFor);
      if (provider) {
        setBadgeProps(el, provider);
      }
    });
  }

  private renderPmProviderDetail(container: Element, provider: PmProvider): void {
    const connected = this.isPmProviderConnected(provider);
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="pm-provider-back-btn" class="dash-back-btn" type="button">← Project Management</button>
        <h2 class="workspace-stage-title"><view-badge id="pm-header-badge"></view-badge> ${escapeHtml(provider.name)}</h2>
      </div>
      ${this.renderPmProviderBody(provider, connected)}
    `;
    setBadgeProps(container.querySelector("#pm-header-badge"), provider);

    this.querySelector("#pm-provider-back-btn")?.addEventListener("click", () => {
      this.selectedPmProviderId = null;
      this.renderView();
    });

    if (provider.kind === "oauth") {
      this.querySelector("#pm-connect-btn")?.addEventListener("click", () => {
        this.handleJiraOAuthBegin();
      });
      this.querySelector("#pm-disconnect-btn")?.addEventListener("click", () => {
        setStoredJiraSession(null);
        this.pmResources = null;
        this.pmConnectError = null;
        this.renderView();
      });
      if (connected && !this.pmResources && !this.pmConnectError && !this.pmConnecting) {
        void this.handleJiraResourceFetch();
      }
      return;
    }

    this.querySelector("#pm-connect-btn")?.addEventListener("click", () => {
      void this.handlePmConnect(provider);
    });
    this.querySelector("#pm-disconnect-btn")?.addEventListener("click", () => {
      if (provider.kind === "keytoken") {
        setStoredTrelloCredentials(null);
      } else {
        setStoredPmToken(provider.id, "");
      }
      this.pmResources = null;
      this.pmConnectError = null;
      this.renderView();
    });

    // Already connected (a credential was saved in a previous session)
    // and nothing fetched yet this visit - fetch automatically, same
    // lazy-validation posture as every other provider's detail screen.
    if (connected && !this.pmResources && !this.pmConnectError && !this.pmConnecting) {
      void this.handlePmConnect(provider);
    }
  }

  private renderPmProviderBody(provider: PmProvider, connected: boolean): string {
    if (provider.kind === "oauth") {
      const appCreds = getStoredJiraAppCredentials();
      return `
        <p class="settings-disclosure">Stored only on this device. This app has no server, so Jira's own OAuth 2.0 flow needs your own Atlassian OAuth app - register one at <code>developer.atlassian.com/console/myapps</code>, add scope <code>read:jira-work</code>, and set its callback URL to exactly <code>${escapeHtml(globalThis.location.origin + globalThis.location.pathname)}</code>. Paste that app's Client ID and Secret below - both stay local, sent directly to Atlassian, never to a backend (this app has none).</p>
        <div class="connect-form">
          <input id="pm-connect-client-id" type="text" placeholder="Atlassian OAuth app Client ID" autocomplete="off" spellcheck="false" value="${escapeHtml(appCreds?.clientId ?? "")}" />
          <input id="pm-connect-client-secret" type="password" placeholder="Atlassian OAuth app Client Secret" autocomplete="off" spellcheck="false" value="${escapeHtml(appCreds?.clientSecret ?? "")}" />
          <div class="connect-actions">
            <button id="pm-connect-btn" type="button">${connected ? "Reconnect with Atlassian" : "Connect with Atlassian"}</button>
            ${connected ? `<button id="pm-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
          </div>
          <p id="pm-connect-status" class="connect-status${this.pmConnectError ? " connect-status-error" : ""}">${this.pmConnecting ? "Connecting…" : this.pmConnectError ? `⚠️ ${escapeHtml(this.pmConnectError)}` : ""}</p>
        </div>
        ${this.renderPmResourceList(provider)}
      `;
    }

    const disclosure = `Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.`;
    const form =
      provider.kind === "keytoken"
        ? `
          <input id="pm-connect-api-key" type="text" placeholder="Trello API key" autocomplete="off" spellcheck="false" />
          <input id="pm-connect-token" type="password" placeholder="Trello token" autocomplete="off" spellcheck="false" />
        `
        : `<input id="pm-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} token" autocomplete="off" spellcheck="false" />`;

    return `
      <p class="settings-disclosure">${disclosure}</p>
      <div class="connect-form">
        ${form}
        <div class="connect-actions">
          <button id="pm-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="pm-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="pm-connect-status" class="connect-status${this.pmConnectError ? " connect-status-error" : ""}">${this.pmConnecting ? "Connecting…" : this.pmConnectError ? `⚠️ ${escapeHtml(this.pmConnectError)}` : ""}</p>
      </div>
      ${this.renderPmResourceList(provider)}
    `;
  }

  private renderPmResourceList(provider: PmProvider): string {
    if (!this.pmResources) {
      return "";
    }
    const label = provider.id === "trello" ? "Boards" : "Issues / Tasks";
    const rows =
      this.pmResources.length === 0
        ? `<p class="connect-hint">Connected - no results found.</p>`
        : `<ul class="resource-list">
            ${this.pmResources
              .map(
                (r) => `
                  <li class="resource-row">
                    <span class="resource-name">${escapeHtml(r.name)}</span>
                    <span class="resource-status">${escapeHtml(r.status)}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>`;
    return `<h3 class="resource-list-label">${label}</h3>${rows}`;
  }

  private async handlePmConnect(provider: PmProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#pm-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#pm-connect-btn");

    let trelloCreds: { apiKey: string; token: string } | null = null;
    let token = "";
    if (provider.kind === "keytoken") {
      const apiKeyInput = this.querySelector<HTMLInputElement>("#pm-connect-api-key");
      const tokenInput = this.querySelector<HTMLInputElement>("#pm-connect-token");
      const apiKey = apiKeyInput?.value.trim() || getStoredTrelloCredentials()?.apiKey || "";
      const tok = tokenInput?.value.trim() || getStoredTrelloCredentials()?.token || "";
      if (!apiKey || !tok) {
        this.pmConnectError = "Enter both the API key and token.";
        this.renderView();
        return;
      }
      trelloCreds = { apiKey, token: tok };
    } else {
      const tokenInput = this.querySelector<HTMLInputElement>("#pm-connect-token");
      token = tokenInput?.value.trim() || getStoredPmToken(provider.id);
      if (!token) {
        this.pmConnectError = "Paste a token first.";
        this.renderView();
        return;
      }
    }

    this.pmConnecting = true;
    this.pmConnectError = null;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Connecting…";
    }
    try {
      const resources =
        provider.kind === "keytoken" && trelloCreds
          ? await connectTrello(trelloCreds.apiKey, trelloCreds.token)
          : await PM_CONNECTORS[provider.id]!(token);
      if (provider.kind === "keytoken" && trelloCreds) {
        setStoredTrelloCredentials(trelloCreds);
      } else {
        setStoredPmToken(provider.id, token);
      }
      this.pmResources = resources;
      this.pmConnectError = null;
    } catch (e) {
      this.pmConnectError = e instanceof Error ? e.message : String(e);
      this.pmResources = null;
    } finally {
      this.pmConnecting = false;
      this.renderView();
    }
  }

  // Jira's "Connect"/"Reconnect" button - reads the user's own OAuth
  // app credentials and navigates the real browser to Atlassian's
  // consent screen (core/pm_connect.ts's beginJiraConnect()). Nothing
  // after a successful call to this ever runs in this page load - the
  // real completion happens in app.ts's main(), on the return trip.
  private handleJiraOAuthBegin(): void {
    const clientIdInput = this.querySelector<HTMLInputElement>("#pm-connect-client-id");
    const clientSecretInput = this.querySelector<HTMLInputElement>("#pm-connect-client-secret");
    const clientId = clientIdInput?.value.trim() || getStoredJiraAppCredentials()?.clientId || "";
    const clientSecret = clientSecretInput?.value.trim() || getStoredJiraAppCredentials()?.clientSecret || "";
    if (!clientId || !clientSecret) {
      this.pmConnectError = "Enter both the Client ID and Client Secret first.";
      this.renderView();
      return;
    }
    const redirectUri = globalThis.location.origin + globalThis.location.pathname;
    beginJiraConnect(clientId, clientSecret, redirectUri);
  }

  // Real re-verification of an already-established Jira session (no
  // OAuth trip needed) - used both for the lazy auto-fetch when a
  // session already exists and after app.ts completes a fresh OAuth
  // round-trip.
  private async handleJiraResourceFetch(): Promise<void> {
    const session = getStoredJiraSession();
    if (!session) {
      return;
    }
    this.pmConnecting = true;
    this.pmConnectError = null;
    this.renderView();
    try {
      this.pmResources = await connectJira(session);
      this.pmConnectError = null;
    } catch (e) {
      this.pmConnectError = e instanceof Error ? e.message : String(e);
      this.pmResources = null;
    } finally {
      this.pmConnecting = false;
      this.renderView();
    }
  }

  // ---- Presentation: AI-generated slide deck (opened from Slides above) ----

  private renderPresentationGenerator(container: Element): void {
    container.innerHTML = "";
    if (!this.presentationGenerator) {
      const generator = document.createElement("control-presentation-generator") as PresentationGeneratorControl;
      generator.generate = async (description) => {
        const provider = getAiAssistProvider();
        if (!provider) {
          throw new Error("Add an Anthropic API key in Settings to generate a presentation.");
        }
        return provider.generateSlides({ description });
      };
      generator.createFile = (rawPath, content) => {
        if (!this.store) {
          return { ok: false, error: "Couldn't create the file." };
        }
        const path = normalizePath(rawPath);
        if (!path) {
          return { ok: false, error: "Enter a path before creating the file." };
        }
        const state = this.store.state.value;
        if (pathExists(state.files, state.emptyFolders, path)) {
          return { ok: false, error: `"${path}" already exists - choose a different path.` };
        }
        this.store.dispatch({ type: "CREATE_FILE", path, content, language: inferLanguage(path) });
        navigateTo("/editor");
        return { ok: true };
      };
      generator.addEventListener("back", () => {
        // One level back - to Presentation's own function list, not all
        // the way out to the Workspace overview.
        this.showPresentationGenerator = false;
        this.renderView();
      });
      this.presentationGenerator = generator;
    }
    container.appendChild(this.presentationGenerator);
  }

  // ---- Development: virtual-filesystem CLI (opened from CLI above) ----

  private renderCliTerminal(container: Element): void {
    container.innerHTML = "";
    if (!this.cliTerminal) {
      const terminal = document.createElement("control-cli-terminal") as CliTerminalControl;
      terminal.run = (input, cwd) => {
        if (!this.store) {
          return { output: "", cwd };
        }
        const state = this.store.state.value;
        return runCliCommand(input, cwd, state.files, state.emptyFolders);
      };
      terminal.addEventListener("back", () => {
        // One level back - to Development's own function list, not all
        // the way out to the Workspace overview.
        this.showCliTerminal = false;
        this.renderView();
      });
      terminal.addEventListener("command", (e) => {
        const action = (e as CustomEvent<{ action: AppAction }>).detail.action;
        this.store?.dispatch(action);
      });
      this.cliTerminal = terminal;
    }
    container.appendChild(this.cliTerminal);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-workspace")) {
  customElements.define("x-workspace", WorkspaceElement);
}
