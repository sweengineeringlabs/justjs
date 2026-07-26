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
// GitHub/GitLab/Bitbucket are all in simple-icons' catalog for real
// (unlike AWS/Azure/Heroku above) - no monogram fallback needed for any
// of the 3 SCM providers. Linear/Asana/Trello/Jira are all in
// simple-icons' catalog for real too - no monogram fallback needed for
// any of the 4 PM providers.
import { SCM_PROVIDER_CATALOG, isScmProviderConnected } from "../core/scm_catalog.js";
import type { ScmProvider } from "../core/scm_catalog.js";
import { fetchConsolidatedScmDashboardAnalytics } from "../core/scm_dashboard_analytics.js";
import type { ConsolidatedScmDashboardAnalytics } from "../core/scm_dashboard_analytics.js";
import { isScmDashboardProviderEnabled, setEnabledScmDashboardProviderIds } from "../core/scm_dashboard_settings.js";
import { PM_PROVIDER_CATALOG, isPmProviderConnected } from "../core/pm_catalog.js";
import type { PmProvider } from "../core/pm_catalog.js";
import { fetchConsolidatedPmDashboardAnalytics } from "../core/pm_dashboard_analytics.js";
import type { ConsolidatedPmDashboardAnalytics } from "../core/pm_dashboard_analytics.js";
import { isPmDashboardProviderEnabled, setEnabledPmDashboardProviderIds } from "../core/pm_dashboard_settings.js";
import { CLOUD_PROVIDER_CATALOG, isCloudProviderConnected } from "../core/cloud_catalog.js";
import type { CloudProvider } from "../core/cloud_catalog.js";
import { fetchConsolidatedCloudDashboardAnalytics } from "../core/cloud_dashboard_analytics.js";
import type { ConsolidatedCloudDashboardAnalytics } from "../core/cloud_dashboard_analytics.js";
import { isCloudDashboardProviderEnabled, setEnabledCloudDashboardProviderIds } from "../core/cloud_dashboard_settings.js";
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
import { beginGithubDeviceFlow } from "../core/github_device_flow.js";
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
import type { BadgeView, GridView, NavHeaderView, FormField } from "@justjs/component-view";
import "@justjs/provider-connect";
import type { ProviderCatalogItem, ProviderConnectorControl } from "@justjs/provider-connect";
import "./cli_terminal.js";
import type { CliTerminalControl } from "./cli_terminal.js";
import "./doc_generator_control.js";
import type { DesignGeneratorControl } from "./doc_generator_control.js";
import "./presentation_generator_control.js";
import type { PresentationGeneratorControl } from "./presentation_generator_control.js";
import "./cloud_connector.js";
import type { CloudCatalogItem, CloudConnectorControl } from "./cloud_connector.js";
import "./cloud_provisioning.js";
import type { CloudProvisioningControl } from "./cloud_provisioning.js";
import "./ec2_provisioning.js";
import type { Ec2ProvisioningControl } from "./ec2_provisioning.js";
import "./ecs_provisioning.js";
import type { EcsProvisioningControl } from "./ecs_provisioning.js";

// Real hex values ported from app.css's own [data-stage="..."] rules -
// <view-grid>'s Shadow DOM can't be reached by that light-DOM selector
// (see grid_view.ts's accentColor doc), so each stage's hue now travels
// as real per-item data instead, the same colors unchanged.
// Muted/desaturated (Tailwind "700"-ish) rather than the original bright
// 500-level rainbow - keeps 9 distinct hues for wayfinding, reads as
// corporate/professional instead of playful.
const STAGE_COLORS: Record<string, string> = {
  ideation: "#b45309",
  requirement: "#1d4ed8",
  planning: "#0f766e",
  design: "#7e22ce",
  development: "#4338ca",
  testing: "#be123c",
  deployment: "#c2410c",
  operations: "#0e7490",
  presentation: "#a21caf",
};

interface SdlcFunction {
  readonly label: string;
  // Rendered into the same GridView tile shape the overview grid
  // already uses ("Workspace option must remain grid widgets, even
  // after drill in" - direct user request) - every function needs an
  // icon for that tile, the same way every stage already has one.
  readonly icon: string;
  // Present => a real, working link into one of this app's existing
  // tabs. Absent (and no `action` either) => an honestly-labeled "Coming
  // soon" stub, not a fake-functional button - this hub currently ships
  // the widget shell only, not new tooling for every stage.
  readonly route?: string;
  // Present => clicking opens an inline view within this stage's own
  // detail screen (this hub's own drill-down), rather than navigating to
  // another tab or showing a stub. "design-generate": Architecture and
  // Wireframes are two distinct entries that both open the same real
  // generateDesignDoc() capability, since one generated Markdown+Mermaid
  // doc genuinely covers what both labels represent (the write-up and
  // the diagram). "cloud-providers": a real, recognizable catalog of
  // actual cloud providers (AWS, Azure, Google Cloud, etc. - see
  // CLOUD_PROVIDER_CATALOG), each with a real connect screen
  // (@justjs/cloud-connect) - a real token/credential pair, sent
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

function toCloudCatalogItem(p: CloudProvider): CloudCatalogItem {
  if (p.kind === "unsupported") {
    return {
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      ...(p.logo !== undefined ? { logo: p.logo } : {}),
      connected: false,
      fields: [],
      unsupportedMessage: `⚠️ ${p.name}'s API did not return CORS headers when checked directly from a browser - connecting here isn't confirmed possible without a backend proxy, which this app doesn't have. Left as a local-list-only entry rather than a connect form that might silently fail.`,
    };
  }
  const disclosure =
    p.kind === "aws"
      ? `Stored only on this device. Signed (AWS SigV4) and sent directly to AWS when you connect - never proxied. AWS's own guidance: prefer short-lived/temporary credentials over a long-term access key pair like this one; only paste a key you're comfortable having live in browser storage.`
      : `Stored only on this device. Sent directly to ${p.name} when you connect.`;
  const fields: FormField[] =
    p.kind === "aws"
      ? [
          { id: "accessKeyId", type: "text", placeholder: "AWS access key ID" },
          { id: "secretAccessKey", type: "password", placeholder: "AWS secret access key" },
        ]
      : [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }];
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    ...(p.logo !== undefined ? { logo: p.logo } : {}),
    connected: isCloudProviderConnected(p),
    fields,
    disclosure,
    ...(p.tokenHint !== undefined ? { tokenHint: p.tokenHint } : {}),
    resourceListLabel: p.kind === "aws" ? "Identity" : "Resources",
    ...(p.kind === "aws" ? { hasListInstances: true } : {}),
    ...(p.supportsDeploy ? { hasDeploy: true } : {}),
  };
}

async function handleCloudConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<CloudResource[]> {
  const provider = CLOUD_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (provider.kind === "aws") {
    const accessKeyId = (values["accessKeyId"] ?? "").trim() || getStoredAwsCredentials()?.accessKeyId || "";
    const secretAccessKey = (values["secretAccessKey"] ?? "").trim() || getStoredAwsCredentials()?.secretAccessKey || "";
    if (!accessKeyId || !secretAccessKey) {
      throw new Error("Enter both the access key ID and secret access key.");
    }
    const resources = await connectAwsIdentity(accessKeyId, secretAccessKey);
    setStoredAwsCredentials({ accessKeyId, secretAccessKey });
    return resources;
  }
  const token = (values["token"] ?? "").trim() || getStoredCloudToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await BEARER_CONNECTORS[providerId]!(token);
  setStoredCloudToken(providerId, token);
  return resources;
}

async function handleCloudList(_providerId: string, session: unknown): Promise<CloudResource[]> {
  return session as CloudResource[];
}

function handleCloudDisconnect(providerId: string): void {
  const provider = CLOUD_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    return;
  }
  if (provider.kind === "aws") {
    setStoredAwsCredentials(null);
  } else {
    setStoredCloudToken(providerId, "");
  }
}

// AWS DescribeInstances is a separate, opt-in call after
// GetCallerIdentity succeeds (see cloud_connect.ts) - needs the real
// ec2:DescribeInstances permission, unlike GetCallerIdentity.
async function handleCloudListInstances(providerId: string): Promise<CloudResource[]> {
  if (providerId !== "aws") {
    throw new Error(`List Instances is AWS-only: ${providerId}`);
  }
  const creds = getStoredAwsCredentials();
  if (!creds) {
    return [];
  }
  return connectAwsInstances(creds.accessKeyId, creds.secretAccessKey);
}

// Real "Deploy this project" action (Netlify/Vercel/Heroku only) - the
// caller (home.ts, via SdlcHubElement.store) owns the store, so it's
// the one that reads the current real file tree, dispatches nothing (a
// deploy doesn't mutate AppState), and persists the returned targetId
// for a later redeploy to reuse the same site/app instead of creating a
// new one each time.
async function handleCloudDeploy(providerId: string, store: FeatureStore<AppState, AppAction> | undefined): Promise<{ url: string }> {
  if (!store) {
    throw new Error("Couldn't deploy - no project loaded.");
  }
  const files = Object.entries(store.state.value.files).map(([path, node]) => ({ path, content: node.content }));
  const token = getStoredCloudToken(providerId);
  const existingTargetId = getStoredCloudDeployTarget(providerId);
  const result = await CLOUD_DEPLOYERS[providerId]!(token, files, existingTargetId ?? undefined);
  setStoredCloudDeployTarget(providerId, result.targetId);
  return result;
}

const SCM_CONNECTORS: Record<string, (token: string) => Promise<ScmResource[]>> = {
  github: connectGithub,
  gitlab: connectGitlab,
  bitbucket: connectBitbucket,
};

// <control-provider-connector> (@justjs/provider-connect) covers this
// exact "provider grid -> single bearer-token form -> resource list"
// shape with zero extension needed for GitLab/Bitbucket.
// ScmResource{id,name,status} already matches ListItem's shape exactly
// (deliberately, see scm-connect's own provider.ts comment), so list()
// below is a pure cast, same as socials.ts's own real usage. GitHub uses
// the control's device-flow mode instead (justjs#135) - no token field,
// no pasted credential at all.
function toScmCatalogItem(p: ScmProvider): ProviderCatalogItem {
  const common = { id: p.id, name: p.name, color: p.color, logo: p.logo, resourceListLabel: "Repositories" };
  if (p.kind === "deviceFlow") {
    return {
      ...common,
      deviceFlow: true,
      fields: [],
      connected: getStoredScmToken(p.id).length > 0,
      disclosure: `Connect with your real ${p.name} account - opens a short code and a link, no token to paste. Sign in from any browser, even another device.`,
    };
  }
  return {
    ...common,
    connected: getStoredScmToken(p.id).length > 0,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
  };
}

async function handleScmConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<ScmResource[]> {
  const provider = SCM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  // Reads values["token"] regardless of who supplied it - a pasted
  // Personal Access Token (bearer providers) or a resolved device-flow
  // access token (GitHub, see handleScmDeviceFlowBegin below). This
  // function needs no branch on p.kind at all.
  const token = (values["token"] ?? "").trim() || getStoredScmToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await SCM_CONNECTORS[providerId]!(token);
  setStoredScmToken(providerId, token);
  return resources;
}

// GitHub's device-flow "Connect" - mirrors handlePmOAuthBegin's own
// provider guard. Delegates to core/github_device_flow.ts, which only
// awaits the device-code request (fast) before returning - the token
// poll itself runs in the background as the returned handle's `token`
// promise, which ProviderConnectorControl awaits and then feeds into
// handleScmConnect's existing {token} shape unchanged.
async function handleScmDeviceFlowBegin(
  providerId: string,
  signal: AbortSignal
): Promise<{ userCode: string; verificationUri: string; token: Promise<string> }> {
  if (providerId !== "github") {
    throw new Error(`Unknown device-flow provider: ${providerId}`);
  }
  return beginGithubDeviceFlow(signal);
}

function handleScmDisconnect(providerId: string): void {
  setStoredScmToken(providerId, "");
}

const PM_CONNECTORS: Record<string, (token: string) => Promise<PmResource[]>> = {
  linear: connectLinear,
  asana: connectAsana,
};

// <control-provider-connector>'s real oauthRedirect support
// (@justjs/provider-connect) covers Jira's real OAuth 2.0 redirect flow
// directly - the form still collects Jira's own OAuth app Client
// ID/Secret (pre-filled via FormField.defaultValue), but submitting them
// navigates the real browser to Atlassian's consent screen instead of
// calling connect().
function toPmCatalogItem(p: PmProvider): ProviderCatalogItem {
  if (p.kind === "oauth") {
    const appCreds = getStoredJiraAppCredentials();
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      logo: p.logo,
      connected: getStoredJiraSession() !== null,
      oauthRedirect: true,
      fields: [
        { id: "clientId", type: "text", placeholder: "Atlassian OAuth app Client ID", defaultValue: appCreds?.clientId ?? "" },
        { id: "clientSecret", type: "password", placeholder: "Atlassian OAuth app Client Secret", defaultValue: appCreds?.clientSecret ?? "" },
      ],
      disclosure: `Stored only on this device. This app has no server, so Jira's own OAuth 2.0 flow needs your own Atlassian OAuth app - register one at developer.atlassian.com/console/myapps, add scope read:jira-work, and set its callback URL to exactly ${globalThis.location.origin + globalThis.location.pathname}. Paste that app's Client ID and Secret below - both stay local, sent directly to Atlassian, never to a backend (this app has none).`,
      resourceListLabel: "Issues / Tasks",
    };
  }
  if (p.kind === "keytoken") {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      logo: p.logo,
      connected: getStoredTrelloCredentials() !== null,
      fields: [
        { id: "apiKey", type: "text", placeholder: "Trello API key" },
        { id: "token", type: "password", placeholder: "Trello token" },
      ],
      disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
      resourceListLabel: "Boards",
    };
  }
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    logo: p.logo,
    connected: getStoredPmToken(p.id).length > 0,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
    resourceListLabel: "Issues / Tasks",
  };
}

async function handlePmConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<PmResource[]> {
  const provider = PM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (provider.kind === "keytoken") {
    const apiKey = (values["apiKey"] ?? "").trim() || getStoredTrelloCredentials()?.apiKey || "";
    const token = (values["token"] ?? "").trim() || getStoredTrelloCredentials()?.token || "";
    if (!apiKey || !token) {
      throw new Error("Enter both the API key and token.");
    }
    const resources = await connectTrello(apiKey, token);
    setStoredTrelloCredentials({ apiKey, token });
    return resources;
  }
  // "oauth" (Jira) never reaches here - ProviderConnectorControl routes
  // it to oauthBegin instead, see handlePmOAuthBegin below.
  const token = (values["token"] ?? "").trim() || getStoredPmToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await PM_CONNECTORS[providerId]!(token);
  setStoredPmToken(providerId, token);
  return resources;
}

// Jira's "Connect"/"Reconnect with Atlassian" submit - reads the user's
// own OAuth app credentials and navigates the real browser to
// Atlassian's consent screen (core/pm_connect.ts's beginJiraConnect()).
// Nothing after a successful call to this ever runs in this page load -
// the real completion happens in app.ts's main(), on the return trip.
function handlePmOAuthBegin(providerId: string, values: Readonly<Record<string, string>>): void {
  if (providerId !== "jira") {
    throw new Error(`Unknown OAuth provider: ${providerId}`);
  }
  const clientId = (values["clientId"] ?? "").trim() || getStoredJiraAppCredentials()?.clientId || "";
  const clientSecret = (values["clientSecret"] ?? "").trim() || getStoredJiraAppCredentials()?.clientSecret || "";
  if (!clientId || !clientSecret) {
    throw new Error("Enter both the Client ID and Client Secret first.");
  }
  const redirectUri = globalThis.location.origin + globalThis.location.pathname;
  beginJiraConnect(clientId, clientSecret, redirectUri);
}

// Jira's oauthRedirect list() - called two ways: (a) directly by
// ProviderConnectorControl's own re-verify path when a session already
// exists (session param is always undefined there, by design - see
// ProviderCatalogItem.oauthRedirect's own doc), or (b) as the ordinary
// list() cast for bearer/keytoken providers, whose "session" IS their
// already-fetched resources (matches socials.ts's/handleScmConnect's
// own real precedent).
async function handlePmList(providerId: string, session: unknown): Promise<PmResource[]> {
  if (providerId === "jira") {
    const jiraSession = getStoredJiraSession();
    return jiraSession ? connectJira(jiraSession) : [];
  }
  return session as PmResource[];
}

function handlePmDisconnect(providerId: string): void {
  const provider = PM_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    return;
  }
  if (provider.kind === "keytoken") {
    setStoredTrelloCredentials(null);
  } else if (provider.kind === "oauth") {
    setStoredJiraSession(null);
  } else {
    setStoredPmToken(providerId, "");
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
// (not a stub) - a real connect screen (@justjs/scm-connect) for
// GitHub/GitLab/Bitbucket (renderScmProviders() below). Deployment's
// Cloud is also real - a real connect screen (@justjs/cloud-connect)
// for actual cloud providers (renderCloudProviders() below).
// Requirement's Specs/User Stories and Planning's Project Boards are
// also real (not stubs) - all 3 open the same real connect screen
// (@justjs/pm-connect) for Linear/Asana/Trello/Jira
// (renderPmProviders() below), the same one-real-capability-shared-
// across-multiple-entries shape Design's Architecture/Wireframes
// already established, just spanning two different stages instead of
// one. Presentation is a 9th widget appended after the 8 SDLC stages -
// it isn't itself an SDLC stage, but the user asked for it alongside
// them, so it lives in the same overview grid. Its one function,
// Slides, is real (not a stub) - a real generateSlides() capability
// (renderPresentationGenerator() below).
const SDLC_STAGES: readonly SdlcStage[] = [
  { key: "ideation", label: "Ideation", icon: "💡", functions: [{ label: "Chat", icon: "💬", route: "/chat" }] },
  {
    key: "requirement",
    label: "Requirement",
    icon: "📋",
    functions: [
      { label: "Specs", icon: "📄", action: "pm-connect" },
      { label: "User Stories", icon: "📖", action: "pm-connect" },
    ],
  },
  { key: "planning", label: "Planning", icon: "🗺️", functions: [{ label: "Project Boards", icon: "🗂️", action: "pm-connect" }] },
  {
    key: "design",
    label: "Design",
    icon: "🎨",
    functions: [
      { label: "Architecture", icon: "🏛️", action: "design-generate" },
      { label: "Wireframes", icon: "📐", action: "design-generate" },
    ],
  },
  {
    key: "development",
    label: "Development",
    icon: "💻",
    // Review/Scaffold consolidated here per direct user request
    // ("Editor, Review, Scaffold must go under Development workspace").
    // Testing's function list is genuinely empty (it had only Review)
    // rather than backfilled with an invented placeholder function.
    functions: [
      { label: "Editor", icon: "📝", route: "/editor" },
      { label: "CLI", icon: "⌨️", action: "cli" },
      { label: "Repository", icon: "📦", action: "scm-connect" },
      { label: "Review", icon: "🔍", route: "/review" },
      { label: "Scaffold", icon: "✨", route: "/scaffold" },
    ],
  },
  { key: "testing", label: "Testing", icon: "🧪", functions: [] },
  {
    key: "deployment",
    label: "Deployment",
    icon: "🚀",
    functions: [{ label: "Cloud", icon: "☁️", action: "cloud-providers" }],
  },
  {
    key: "operations",
    label: "Operations",
    icon: "📈",
    functions: [
      { label: "Monitoring", icon: "📊" },
      { label: "Logs", icon: "📜" },
    ],
  },
  {
    key: "presentation",
    label: "Presentation",
    icon: "📽️",
    functions: [{ label: "Slides", icon: "📽️", action: "presentation-generate" }],
  },
];

type DashboardTabId = "analytics" | "trending" | "settings";

// Dashboard's own 3 switchable tabs - Analytics/Trending/Settings, NOT
// one tab per connected provider (justjs#137's established pattern,
// replicated here for SCM's own Dashboard, justjs#139). Recent Activity
// is NOT one of these tabs - it's a permanent section pinned at the
// bottom of the workspace regardless of which tab is active, same as
// Socials' own Dashboard.
const DASHBOARD_TABS: readonly { readonly id: DashboardTabId; readonly label: string; readonly icon: string }[] = [
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "trending", label: "Trending", icon: "🔥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function formatDashboardActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The SDLC hub: a 9-widget overview (8 SDLC stages plus Presentation),
// drilling into each stage's function list on tap. Design, Development's
// CLI, Deployment's Cloud, and Presentation's Slides are the stages with
// real, inline functionality (a Markdown+Mermaid design-doc generator; a
// real virtual-filesystem terminal; a real cloud-provider catalog to
// toggle on/off; an AI-generated slide deck) rather than a link
// elsewhere or a stub.
//
// A plain HTMLElement control (like cli_terminal.ts/cloud_connector.ts),
// not a justweb-generated component - this hub lives inline on the Home
// page (home.ts appends one <control-sdlc-hub> into its own markup, was
// previously WorkspaceElement's own top-level route/mount). No dom.
// yaml/data-part bindings here: every internal ref is a plain id +
// querySelector lookup instead. `store` is forwarded manually by
// home.ts on creation and on every dataContext update, since this
// element is never itself router-mounted.
export class SdlcHubElement extends HTMLElement {
  private store?: FeatureStore<AppState, AppAction>;
  private currentStageKey: string | null = null;

  private workspaceView!: HTMLElement;
  private overviewGrid!: GridView;
  private functionListView!: HTMLElement;
  private backBtn!: HTMLButtonElement;
  private stageTitle!: HTMLElement;
  private functionList!: GridView;
  private subscreenView!: HTMLElement;

  // Design-stage generator - <control-design-generator>.
  // Description/doc/viewMode/render-token live on that element itself;
  // cached in designGenerator so the same instance (and its in-progress
  // doc) survives leaving and re-entering via either Architecture or
  // Wireframes - same persistence semantics as CliTerminalControl's
  // cliTerminal caching.
  private designGenerator: DesignGeneratorControl | undefined;
  // Design has three drill-down levels (overview -> Design's own
  // Architecture/Wireframes list -> the shared generator), one more than
  // every other stage's two (overview -> function list). This flag is
  // the third level's on/off switch.
  private showDesignGenerator = false;

  // Deployment's Cloud providers - <control-cloud-connector> (an
  // app-local sibling to <control-provider-connector> since AWS's List
  // EC2 Instances and 3 providers' Deploy don't fit the shared
  // package's own scope - see cloud_connector.ts's own doc comment).
  // Same caching/real-resetView()-on-stage-switch reasoning as
  // scmScreen/pmScreen.
  private showCloudProviders = false;
  private cloudScreen: HTMLElement | undefined;
  private cloudMainView!: HTMLElement;
  private cloudDashboardView!: HTMLElement;
  private cloudDashboardBackBtn!: HTMLButtonElement;
  private cloudDashboardTabsEl!: HTMLElement;
  private cloudDashboardTabContentEl!: HTMLElement;
  private cloudDashboardActivityEl!: HTMLElement;
  private cloudDashboardData: ConsolidatedCloudDashboardAnalytics | null = null;
  private activeCloudDashboardTab: DashboardTabId = "analytics";
  private readonly expandedCloudMetricKeys = new Set<string>();
  // Real cloud provisioning workflow (connect -> configure -> deploy ->
  // monitor) - CloudWatch alarms are the pilot service, a second sibling
  // view alongside Dashboard, same cache/reset pattern.
  private cloudProvisioningView!: HTMLElement;
  private cloudProvisioningBackBtn!: HTMLButtonElement;
  // EC2 provisioning (justjs#144/ADR-0017) - the second phase, a third
  // sibling view alongside Dashboard/Alarms, same cache/reset pattern.
  private cloudEc2View!: HTMLElement;
  private cloudEc2BackBtn!: HTMLButtonElement;
  // ECS Clusters view alongside Dashboard/Alarms/Instances, same
  // cache/reset pattern (justjs#144/ADR-0017's ECS phase).
  private cloudEcsView!: HTMLElement;
  private cloudEcsBackBtn!: HTMLButtonElement;

  // Development's Repository - <control-provider-connector>, which owns
  // which-provider-is-selected/fetched-resources state internally.
  // scmScreen caches the whole composed wrapper (header + hint +
  // connector + Dashboard tile/view) so that state (and grid<->detail
  // position) survives leaving and re-entering Repository within
  // Development, and across tab switches - real reset via the
  // connector's own resetView() (justjs#138/#139) plus this screen's own
  // resetScmDashboardToMain(), both called from the overview grid's
  // item-select handler below, instead of discarding and rebuilding the
  // whole wrapper.
  private showScmConnect = false;
  private scmScreen: HTMLElement | undefined;
  private scmMainView!: HTMLElement;
  private scmDashboardView!: HTMLElement;
  private scmDashboardBackBtn!: HTMLButtonElement;
  private scmDashboardTabsEl!: HTMLElement;
  private scmDashboardTabContentEl!: HTMLElement;
  private scmDashboardActivityEl!: HTMLElement;
  private scmDashboardData: ConsolidatedScmDashboardAnalytics | null = null;
  private activeScmDashboardTab: DashboardTabId = "analytics";
  private readonly expandedScmMetricKeys = new Set<string>();

  // Requirement's/Planning's project-management connections -
  // <control-provider-connector>, same caching/reset-on-stage-switch
  // reasoning as scmScreen above. pmScreen is shared across both stages
  // (one real capability, not two separate ones) - its own back-button
  // label is refreshed on every renderPmProviders() call since the two
  // entry stages have different labels ("← Requirement" vs
  // "← Planning"), unlike scmScreen's single fixed "← Development".
  private showPmConnect = false;
  private pmScreen: HTMLElement | undefined;
  private pmMainView!: HTMLElement;
  private pmDashboardView!: HTMLElement;
  private pmDashboardBackBtn!: HTMLButtonElement;
  private pmDashboardTabsEl!: HTMLElement;
  private pmDashboardTabContentEl!: HTMLElement;
  private pmDashboardActivityEl!: HTMLElement;
  private pmDashboardData: ConsolidatedPmDashboardAnalytics | null = null;
  private activePmDashboardTab: DashboardTabId = "analytics";
  private readonly expandedPmMetricKeys = new Set<string>();

  // Presentation-stage generator - <control-presentation-generator>,
  // same caching reasoning as designGenerator above.
  private presentationGenerator: PresentationGeneratorControl | undefined;
  private showPresentationGenerator = false;

  // Development's CLI - a real terminal against this app's own virtual
  // filesystem (core/cli.ts), <control-cli-terminal>. cwd/history live
  // on that element itself, cached in cliTerminal so the same instance
  // (and its state) survives leaving and re-entering the CLI sub-screen.
  private cliTerminal: CliTerminalControl | undefined;
  private showCliTerminal = false;

  setStore(s: FeatureStore<AppState, AppAction> | undefined): void {
    this.store = s;
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div id="workspace-view">
        <view-grid id="workspace-overview-grid" hidden></view-grid>
        <div id="workspace-function-list-view" hidden>
          <div class="dash-subnav">
            <button id="workspace-back-btn" class="dash-back-btn" type="button">← Home</button>
            <h2 class="workspace-stage-title" id="workspace-stage-title"></h2>
          </div>
          <!-- "Workspace option must remain grid widgets, even after
               drill in" (direct user request) - the same <view-grid> the
               overview above uses, not a plain button list. -->
          <view-grid id="workspace-function-grid"></view-grid>
        </div>
        <div id="workspace-subscreen-view" hidden></div>
      </div>
    `;
    this.workspaceView = this.querySelector<HTMLElement>("#workspace-view")!;
    this.overviewGrid = this.querySelector<GridView>("#workspace-overview-grid")!;
    this.functionListView = this.querySelector<HTMLElement>("#workspace-function-list-view")!;
    this.backBtn = this.querySelector<HTMLButtonElement>("#workspace-back-btn")!;
    this.stageTitle = this.querySelector<HTMLElement>("#workspace-stage-title")!;
    this.functionList = this.querySelector<GridView>("#workspace-function-grid")!;
    this.subscreenView = this.querySelector<HTMLElement>("#workspace-subscreen-view")!;

    // Both bound once - the overview grid and the back button are
    // permanent, cached elements (not torn down and rebuilt on every
    // overview/stage transition), so their listeners only need wiring a
    // single time here, not per-render.
    this.backBtn.addEventListener("click", () => {
      this.currentStageKey = null;
      this.renderView();
    });
    this.overviewGrid.addEventListener("item-select", (e) => {
      this.currentStageKey = (e as CustomEvent<{ id: string }>).detail.id;
      // Always start a freshly-entered stage at its function list, not
      // mid-generator/mid-provider-list from a previous visit.
      this.showDesignGenerator = false;
      this.showCloudProviders = false;
      // Real reset instead of discard-and-recreate (justjs#138/#139) -
      // CloudConnectorControl/ProviderConnectorControl now both expose a
      // public resetView(), so the cached wrapper (and the real state a
      // future Dashboard would add) survives a stage switch instead of
      // being thrown away and rebuilt from scratch every time. Guarded
      // on the screen actually existing - first visit to a stage never
      // created scmScreen/pmScreen/cloudScreen yet. Split into two
      // statements (not a single `a?.b(...)?.c()` chain) - justc's
      // optional-chaining transpile drops the guard on the leading `?.`
      // in a chained double-optional call, only guarding the trailing
      // one, which threw on `this.cloudScreen.querySelector` when
      // cloudScreen was still undefined.
      const cloudConnector = this.cloudScreen?.querySelector<CloudConnectorControl>("#cloud-connector");
      cloudConnector?.resetView();
      this.resetCloudDashboardToMain();
      this.resetCloudProvisioningToMain();
      this.resetCloudEc2ToMain();
      this.resetCloudEcsToMain();
      this.showScmConnect = false;
      const scmConnector = this.scmScreen?.querySelector<ProviderConnectorControl>("#scm-connector");
      scmConnector?.resetView();
      this.resetScmDashboardToMain();
      this.showPmConnect = false;
      const pmConnector = this.pmScreen?.querySelector<ProviderConnectorControl>("#pm-connector");
      pmConnector?.resetView();
      this.resetPmDashboardToMain();
      this.showPresentationGenerator = false;
      this.showCliTerminal = false;
      this.renderView();
    });
    // Bound once, same reasoning as overviewGrid above - the function
    // grid is a permanent, cached element too (re-populated via .items
    // per stage in renderStage(), not torn down and rebuilt).
    this.functionList.addEventListener("item-select", (e) => {
      this.handleFunctionSelect((e as CustomEvent<{ id: string }>).detail.id);
    });

    this.renderView();
  }

  // GridView's tiles are always real buttons - a stub function (neither
  // route nor action) still fires item-select, but with nothing to do
  // it's an intentional no-op, signaled via a "Coming soon" status label
  // on the tile. Reads the current stage fresh from
  // SDLC_STAGES/this.currentStageKey rather than closing over `stage`
  // from renderStage(), since this listener is wired once in
  // connectedCallback(), not per-render.
  private handleFunctionSelect(functionLabel: string): void {
    const stage = SDLC_STAGES.find((s) => s.key === this.currentStageKey);
    const fn = stage?.functions.find((f) => f.label === functionLabel);
    if (!fn) {
      return;
    }
    switch (fn.action) {
      case "design-generate":
        this.showDesignGenerator = true;
        this.renderView();
        return;
      case "cloud-providers":
        this.showCloudProviders = true;
        this.renderView();
        return;
      case "scm-connect":
        this.showScmConnect = true;
        this.renderView();
        return;
      case "pm-connect":
        this.showPmConnect = true;
        this.renderView();
        return;
      case "presentation-generate":
        this.showPresentationGenerator = true;
        this.renderView();
        return;
      case "cli":
        this.showCliTerminal = true;
        this.renderView();
        return;
    }
    if (fn.route) {
      navigateTo(fn.route);
    }
  }

  private renderView(): void {
    const stage = SDLC_STAGES.find((s) => s.key === this.currentStageKey);
    if (!stage) {
      this.renderOverview();
      return;
    }
    this.renderStage(stage);
  }

  private renderOverview(): void {
    // Clears whatever a previous drill-down's renderStage() set - the
    // overview grid colors each widget individually, not the container.
    this.workspaceView.removeAttribute("data-stage");
    this.functionListView.hidden = true;
    // Detaches whatever sub-screen was showing (if any). The cached
    // instance itself (this.cliTerminal/designGenerator/etc) survives
    // regardless, held by its own JS reference, not the DOM.
    this.subscreenView.hidden = true;
    this.subscreenView.innerHTML = "";
    this.overviewGrid.hidden = false;
    this.overviewGrid.items = SDLC_STAGES.map((s) => ({
      id: s.key,
      label: s.label,
      icon: s.icon,
      accentColor: STAGE_COLORS[s.key],
    }));
  }

  private renderStage(stage: SdlcStage): void {
    // Lets the drill-down (function list + every special sub-view -
    // Design's generator, Cloud, Presentation's generator, the CLI)
    // inherit the same --stage-color the overview grid's widget already
    // set per stage (app.css's [data-stage="..."] rules), instead of
    // falling back to flat var(--surface) once you're inside a stage.
    this.workspaceView.setAttribute("data-stage", stage.key);
    this.overviewGrid.hidden = true;

    if (stage.key === "design" && this.showDesignGenerator) {
      this.renderDesignGenerator();
      return;
    }
    if (stage.key === "deployment" && this.showCloudProviders) {
      this.renderCloudProviders();
      return;
    }
    if (stage.key === "presentation" && this.showPresentationGenerator) {
      this.renderPresentationGenerator();
      return;
    }
    if (stage.key === "development" && this.showCliTerminal) {
      this.renderCliTerminal();
      return;
    }
    if (stage.key === "development" && this.showScmConnect) {
      this.renderScmProviders();
      return;
    }
    if ((stage.key === "requirement" || stage.key === "planning") && this.showPmConnect) {
      this.renderPmProviders(stage);
      return;
    }

    // Same detach reasoning as renderOverview() above - the generic
    // function-list view can be reached directly from a sub-screen's
    // own back button (e.g. Design's "← Design"), not just from the
    // overview.
    this.subscreenView.hidden = true;
    this.subscreenView.innerHTML = "";
    this.functionListView.hidden = false;
    this.stageTitle.textContent = `${stage.icon} ${stage.label}`;
    // GridView instance is permanent (bound once in connectedCallback());
    // re-populating .items per stage is the same pattern renderOverview()
    // already uses for the overview grid.
    this.functionList.items = stage.functions.map((f) => ({
      id: f.label,
      label: f.label,
      icon: f.icon,
      accentColor: STAGE_COLORS[stage.key],
      ...(f.route === undefined && f.action === undefined ? { status: "Coming soon" } : {}),
    }));
  }

  // ---- Design: Markdown + Mermaid doc generator (opened from either
  // Architecture or Wireframes above) ----

  private renderDesignGenerator(): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
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
        // not all the way out to the overview (that back button, in the
        // generic function-list view above, handles that level).
        this.showDesignGenerator = false;
        this.renderView();
      });
      this.designGenerator = generator;
    }
    this.subscreenView.appendChild(this.designGenerator);
  }

  // ---- Deployment: Cloud providers (opened from Cloud above) -
  // <control-cloud-connector>. ----

  private renderCloudProviders(): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
    if (!this.cloudScreen) {
      const screen = document.createElement("div");
      screen.innerHTML = `
        <div id="cloud-main-view">
          <view-nav-header id="cloud-header"></view-nav-header>
          <p class="connect-hint">Tap a provider to connect a real account and see its actual resources. Tokens/credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none). See each provider's own connect screen for the exact security tradeoff.</p>
          <control-cloud-connector id="cloud-connector"></control-cloud-connector>
          <view-grid id="cloud-dashboard-tile-grid"></view-grid>
        </div>
        <div id="cloud-dashboard-view" hidden>
          <div class="dash-subnav">
            <button id="cloud-dashboard-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
            <h2 class="workspace-stage-title">📊 Dashboard</h2>
          </div>
          <div id="cloud-dashboard-tabs" class="dashboard-tabs"></div>
          <div id="cloud-dashboard-tab-content"></div>
          <p class="dashboard-section-title">🕒 Recent Activity</p>
          <div id="cloud-dashboard-activity"></div>
        </div>
        <div id="cloud-provisioning-view" hidden>
          <div class="dash-subnav">
            <button id="cloud-provisioning-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
            <h2 class="workspace-stage-title">🔔 Alarms</h2>
          </div>
          <control-cloud-provisioning id="cloud-provisioning"></control-cloud-provisioning>
        </div>
        <div id="cloud-ec2-view" hidden>
          <div class="dash-subnav">
            <button id="cloud-ec2-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
            <h2 class="workspace-stage-title">🖥️ Instances</h2>
          </div>
          <control-ec2-provisioning id="cloud-ec2"></control-ec2-provisioning>
        </div>
        <div id="cloud-ecs-view" hidden>
          <div class="dash-subnav">
            <button id="cloud-ecs-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
            <h2 class="workspace-stage-title">📦 Clusters</h2>
          </div>
          <control-ecs-provisioning id="cloud-ecs"></control-ecs-provisioning>
        </div>
      `;
      const header = screen.querySelector<NavHeaderView>("#cloud-header")!;
      header.icon = "🚀";
      header.title = "Cloud Providers";
      header.backLabel = "Deployment";
      header.addEventListener("nav-back", () => {
        // One level back - to Deployment's own function list, not all
        // the way out to the overview.
        this.showCloudProviders = false;
        this.renderView();
      });
      const connector = screen.querySelector<CloudConnectorControl>("#cloud-connector")!;
      connector.providers = CLOUD_PROVIDER_CATALOG.map(toCloudCatalogItem);
      connector.connect = handleCloudConnect;
      connector.list = handleCloudList;
      connector.disconnect = handleCloudDisconnect;
      connector.listInstances = handleCloudListInstances;
      connector.deploy = (providerId) => handleCloudDeploy(providerId, this.store);
      connector.catalogLabel = "Cloud Providers";

      this.cloudMainView = screen.querySelector<HTMLElement>("#cloud-main-view")!;
      this.cloudDashboardView = screen.querySelector<HTMLElement>("#cloud-dashboard-view")!;
      this.cloudDashboardBackBtn = screen.querySelector<HTMLButtonElement>("#cloud-dashboard-back-btn")!;
      this.cloudDashboardTabsEl = screen.querySelector<HTMLElement>("#cloud-dashboard-tabs")!;
      this.cloudDashboardTabContentEl = screen.querySelector<HTMLElement>("#cloud-dashboard-tab-content")!;
      this.cloudDashboardActivityEl = screen.querySelector<HTMLElement>("#cloud-dashboard-activity")!;

      this.cloudProvisioningView = screen.querySelector<HTMLElement>("#cloud-provisioning-view")!;
      this.cloudProvisioningBackBtn = screen.querySelector<HTMLButtonElement>("#cloud-provisioning-back-btn")!;
      this.cloudEc2View = screen.querySelector<HTMLElement>("#cloud-ec2-view")!;
      this.cloudEc2BackBtn = screen.querySelector<HTMLButtonElement>("#cloud-ec2-back-btn")!;
      this.cloudEcsView = screen.querySelector<HTMLElement>("#cloud-ecs-view")!;
      this.cloudEcsBackBtn = screen.querySelector<HTMLButtonElement>("#cloud-ecs-back-btn")!;

      const dashboardTileGrid = screen.querySelector<GridView>("#cloud-dashboard-tile-grid")!;
      dashboardTileGrid.items = [
        { id: "dashboard", label: "Dashboard", icon: "📊" },
        { id: "alarms", label: "Alarms", icon: "🔔" },
        { id: "instances", label: "Instances", icon: "🖥️" },
        { id: "clusters", label: "Clusters", icon: "📦" },
      ];
      dashboardTileGrid.addEventListener("item-select", (e) => {
        const id = (e as CustomEvent<{ id: string }>).detail.id;
        if (id === "dashboard") {
          this.showCloudDashboard();
        } else if (id === "alarms") {
          this.showCloudProvisioning();
        } else if (id === "instances") {
          this.showCloudEc2();
        } else if (id === "clusters") {
          this.showCloudEcs();
        }
      });
      this.cloudDashboardBackBtn.addEventListener("click", () => this.resetCloudDashboardToMain());
      this.cloudProvisioningBackBtn.addEventListener("click", () => this.resetCloudProvisioningToMain());
      this.cloudEc2BackBtn.addEventListener("click", () => this.resetCloudEc2ToMain());
      this.cloudEcsBackBtn.addEventListener("click", () => this.resetCloudEcsToMain());

      this.cloudScreen = screen;
    }
    this.subscreenView.appendChild(this.cloudScreen);
  }

  private showCloudDashboard(): void {
    this.cloudMainView.hidden = true;
    this.cloudDashboardView.hidden = false;
    this.activeCloudDashboardTab = "analytics";
    this.expandedCloudMetricKeys.clear();
    this.renderCloudDashboardTabs();
    void this.loadCloudDashboardData();
  }

  // Real reset back to the main provider grid - called both by the
  // Dashboard's own back button and by the overview grid's item-select
  // handler (alongside cloudConnector.resetView()), same reasoning as
  // resetScmDashboardToMain()/resetPmDashboardToMain(). Safe no-op if
  // cloudScreen was never built yet.
  private resetCloudDashboardToMain(): void {
    if (!this.cloudScreen) {
      return;
    }
    this.cloudDashboardView.hidden = true;
    this.cloudMainView.hidden = false;
  }

  private showCloudProvisioning(): void {
    this.cloudMainView.hidden = true;
    this.cloudProvisioningView.hidden = false;
  }

  // Same reasoning as resetCloudDashboardToMain() - called both by this
  // view's own back button and by the overview grid's item-select
  // handler, plus resets the control's own internal state (the
  // Configure form / Monitor list) via its resetView(), same pattern
  // CloudConnectorControl's own resetView() already established.
  private resetCloudProvisioningToMain(): void {
    if (!this.cloudScreen) {
      return;
    }
    this.cloudProvisioningView.hidden = true;
    this.cloudMainView.hidden = false;
    const provisioning = this.cloudScreen.querySelector<CloudProvisioningControl>("#cloud-provisioning");
    provisioning?.resetView();
  }

  private showCloudEc2(): void {
    this.cloudMainView.hidden = true;
    this.cloudEc2View.hidden = false;
  }

  // Same reasoning as resetCloudProvisioningToMain().
  private resetCloudEc2ToMain(): void {
    if (!this.cloudScreen) {
      return;
    }
    this.cloudEc2View.hidden = true;
    this.cloudMainView.hidden = false;
    const ec2 = this.cloudScreen.querySelector<Ec2ProvisioningControl>("#cloud-ec2");
    ec2?.resetView();
  }

  private showCloudEcs(): void {
    this.cloudMainView.hidden = true;
    this.cloudEcsView.hidden = false;
  }

  // Same reasoning as resetCloudEc2ToMain().
  private resetCloudEcsToMain(): void {
    if (!this.cloudScreen) {
      return;
    }
    this.cloudEcsView.hidden = true;
    this.cloudMainView.hidden = false;
    const ecs = this.cloudScreen.querySelector<EcsProvisioningControl>("#cloud-ecs");
    ecs?.resetView();
  }

  private renderCloudDashboardTabs(): void {
    this.cloudDashboardTabsEl.innerHTML = DASHBOARD_TABS.map(
      (t) => `
        <button type="button" class="dashboard-tab ${t.id === this.activeCloudDashboardTab ? "dashboard-tab-active" : ""}" data-tab="${t.id}">
          ${t.icon} ${t.label}
        </button>
      `
    ).join("");
    this.cloudDashboardTabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset["tab"] as DashboardTabId;
        if (tabId === this.activeCloudDashboardTab) {
          return;
        }
        this.activeCloudDashboardTab = tabId;
        this.renderCloudDashboardTabs();
        this.renderActiveCloudDashboardTab();
      });
    });
  }

  private async loadCloudDashboardData(): Promise<void> {
    this.cloudDashboardTabContentEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.cloudDashboardActivityEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.cloudDashboardData = await fetchConsolidatedCloudDashboardAnalytics();
    this.renderActiveCloudDashboardTab();
    this.renderCloudActivitySection(this.cloudDashboardData);
  }

  private renderActiveCloudDashboardTab(): void {
    if (this.activeCloudDashboardTab === "settings") {
      this.renderCloudSettingsTab();
      return;
    }
    if (!this.cloudDashboardData) {
      return;
    }
    if (this.activeCloudDashboardTab === "analytics") {
      this.renderCloudAnalyticsTab(this.cloudDashboardData);
    } else {
      this.renderCloudTrendingTab(this.cloudDashboardData);
    }
  }

  private cloudNoDataHint(): string {
    const anyConnected = CLOUD_PROVIDER_CATALOG.some(isCloudProviderConnected);
    return anyConnected
      ? "Nothing enabled - turn a provider back on in the Settings tab."
      : "Nothing connected yet - connect a provider above to see its real data here.";
  }

  private renderCloudAnalyticsTab(data: ConsolidatedCloudDashboardAnalytics): void {
    if (data.metrics.length === 0 && data.unavailable.length === 0) {
      this.cloudDashboardTabContentEl.innerHTML = `<p class="connect-hint">${this.cloudNoDataHint()}</p>`;
      return;
    }
    const rowHtml = data.metrics
      .map((metric) => {
        const key = `${metric.providerId}:${metric.label}`;
        const active = this.expandedCloudMetricKeys.has(key);
        return `
          <button type="button" class="metric-chip ${active ? "metric-chip-active" : ""}" data-metric-key="${key}">
            <span class="metric-chip-count">${metric.count}</span>
            <span class="metric-chip-label">${metric.label}</span>
            <span class="metric-chip-source">${metric.providerName}</span>
          </button>
        `;
      })
      .join("");
    const selected = data.metrics.find((m) => this.expandedCloudMetricKeys.has(`${m.providerId}:${m.label}`));
    const itemsHtml = selected
      ? `<div class="metric-items">${selected.items.map((item) => `<p class="metric-item">${item.label}</p>`).join("")}</div>`
      : "";
    const unavailableHtml = data.unavailable.map((u) => `<p class="connect-hint">⚠️ ${u.message}</p>`).join("");
    this.cloudDashboardTabContentEl.innerHTML = `<div class="metrics-row">${rowHtml}</div>${itemsHtml}${unavailableHtml}`;

    this.cloudDashboardTabContentEl.querySelectorAll<HTMLButtonElement>("button[data-metric-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset["metricKey"]!;
        if (this.expandedCloudMetricKeys.has(key)) {
          this.expandedCloudMetricKeys.delete(key);
        } else {
          this.expandedCloudMetricKeys.clear();
          this.expandedCloudMetricKeys.add(key);
        }
        this.renderCloudAnalyticsTab(data);
      });
    });
  }

  private renderCloudTrendingTab(data: ConsolidatedCloudDashboardAnalytics): void {
    if (data.trending.length === 0) {
      this.cloudDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing trending right now.</p>`;
      return;
    }
    this.cloudDashboardTabContentEl.innerHTML = data.trending
      .map(
        (item) => `
          <div class="trending-item">
            <span>${item.title} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="trending-item-score">${item.score}</span>
          </div>
        `
      )
      .join("");
  }

  private renderCloudActivitySection(data: ConsolidatedCloudDashboardAnalytics): void {
    if (data.recentActivity.length === 0) {
      this.cloudDashboardActivityEl.innerHTML = `<p class="connect-hint">No recent activity.</p>`;
      return;
    }
    this.cloudDashboardActivityEl.innerHTML = data.recentActivity
      .map(
        (item) => `
          <div class="activity-item">
            <span>${item.summary} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="activity-item-time">${formatDashboardActivityTime(item.timestamp)}</span>
          </div>
        `
      )
      .join("");
  }

  private renderCloudSettingsTab(): void {
    const connected = CLOUD_PROVIDER_CATALOG.filter(isCloudProviderConnected);
    if (connected.length === 0) {
      this.cloudDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing connected yet - connect a provider above, then come back here to choose what Dashboard shows.</p>`;
      return;
    }
    this.cloudDashboardTabContentEl.innerHTML = `
      <p class="connect-hint">Choose which connected providers contribute to Analytics, Trending, and Recent Activity.</p>
      ${connected
        .map(
          (p) => `
            <label class="field">
              <input type="checkbox" data-settings-provider="${p.id}" ${isCloudDashboardProviderEnabled(p.id) ? "checked" : ""} />
              <span class="field-label">${p.name}</span>
            </label>
          `
        )
        .join("")}
    `;
    this.cloudDashboardTabContentEl.querySelectorAll<HTMLInputElement>("input[data-settings-provider]").forEach((input) => {
      input.addEventListener("change", () => {
        const enabledIds = connected
          .filter((p) => this.cloudDashboardTabContentEl.querySelector<HTMLInputElement>(`input[data-settings-provider="${p.id}"]`)?.checked)
          .map((p) => p.id);
        setEnabledCloudDashboardProviderIds(enabledIds);
        void this.loadCloudDashboardData();
      });
    });
  }

  // ---- Development: source-control connections (opened from Repository
  // above) - <control-provider-connector>: GitLab/Bitbucket use a single
  // bearer-token field; GitHub uses the control's device-flow mode
  // (justjs#135) - no token to paste, real OAuth via a short code +
  // link, working in the packaged Android WebView where a redirect-based
  // flow (like Jira's) has no HTTP origin to land on. ----

  private renderScmProviders(): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
    if (!this.scmScreen) {
      const screen = document.createElement("div");
      screen.innerHTML = `
        <div id="scm-main-view">
          <view-nav-header id="scm-header"></view-nav-header>
          <p class="connect-hint">Tap a provider to connect a real account and see its actual repositories. GitLab/Bitbucket tokens are stored only on this device, sent directly to that provider. GitHub signs in via a real OAuth device flow instead of a pasted token - the code request and sign-in poll relay through a small local service (scm/bo, justjs#135) only to add the CORS headers GitHub's own endpoints don't send; it never sees or stores your token, and every actual repository call still goes straight from this device to GitHub, unproxied.</p>
          <control-provider-connector id="scm-connector"></control-provider-connector>
          <view-grid id="scm-dashboard-tile-grid"></view-grid>
        </div>
        <div id="scm-dashboard-view" hidden>
          <div class="dash-subnav">
            <button id="scm-dashboard-back-btn" class="dash-back-btn" type="button">← Repository</button>
            <h2 class="workspace-stage-title">📊 Dashboard</h2>
          </div>
          <div id="scm-dashboard-tabs" class="dashboard-tabs"></div>
          <div id="scm-dashboard-tab-content"></div>
          <p class="dashboard-section-title">🕒 Recent Activity</p>
          <div id="scm-dashboard-activity"></div>
        </div>
      `;
      const header = screen.querySelector<NavHeaderView>("#scm-header")!;
      // icon/title are private-field-backed accessors on NavHeaderView,
      // not reflected HTML attributes - must be set via JS property
      // assignment, not inline in the template string above.
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
      connector.deviceFlowBegin = handleScmDeviceFlowBegin;
      connector.catalogLabel = "Repository";

      this.scmMainView = screen.querySelector<HTMLElement>("#scm-main-view")!;
      this.scmDashboardView = screen.querySelector<HTMLElement>("#scm-dashboard-view")!;
      this.scmDashboardBackBtn = screen.querySelector<HTMLButtonElement>("#scm-dashboard-back-btn")!;
      this.scmDashboardTabsEl = screen.querySelector<HTMLElement>("#scm-dashboard-tabs")!;
      this.scmDashboardTabContentEl = screen.querySelector<HTMLElement>("#scm-dashboard-tab-content")!;
      this.scmDashboardActivityEl = screen.querySelector<HTMLElement>("#scm-dashboard-activity")!;

      // Same real <view-grid> tile technique justjs#137 proved for
      // Socials - the Dashboard tile sits as an additional item
      // immediately after the connector, not a separate isolated widget.
      const dashboardTileGrid = screen.querySelector<GridView>("#scm-dashboard-tile-grid")!;
      dashboardTileGrid.items = [{ id: "dashboard", label: "Dashboard", icon: "📊" }];
      dashboardTileGrid.addEventListener("item-select", () => this.showScmDashboard());
      this.scmDashboardBackBtn.addEventListener("click", () => this.resetScmDashboardToMain());

      this.scmScreen = screen;
    }
    this.subscreenView.appendChild(this.scmScreen);
  }

  // Rebuilt fresh every time Dashboard is opened - real data, not a
  // stale cache, same guarantee Socials' own Dashboard established
  // (justjs#137).
  private showScmDashboard(): void {
    this.scmMainView.hidden = true;
    this.scmDashboardView.hidden = false;
    this.activeScmDashboardTab = "analytics";
    this.expandedScmMetricKeys.clear();
    this.renderScmDashboardTabs();
    void this.loadScmDashboardData();
  }

  // Real reset back to the main provider grid - called both by the
  // Dashboard's own back button and by the overview grid's item-select
  // handler (alongside scmConnector.resetView()) so re-entering
  // Development never leaves Dashboard "stuck" open, the same
  // navigate-away sticking bug justjs#137/#138 fixed for Socials/Comms/
  // Cartoon. Safe no-op if scmScreen was never built yet (first visit).
  private resetScmDashboardToMain(): void {
    if (!this.scmScreen) {
      return;
    }
    this.scmDashboardView.hidden = true;
    this.scmMainView.hidden = false;
  }

  private renderScmDashboardTabs(): void {
    this.scmDashboardTabsEl.innerHTML = DASHBOARD_TABS.map(
      (t) => `
        <button type="button" class="dashboard-tab ${t.id === this.activeScmDashboardTab ? "dashboard-tab-active" : ""}" data-tab="${t.id}">
          ${t.icon} ${t.label}
        </button>
      `
    ).join("");
    this.scmDashboardTabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset["tab"] as DashboardTabId;
        if (tabId === this.activeScmDashboardTab) {
          return;
        }
        this.activeScmDashboardTab = tabId;
        this.renderScmDashboardTabs();
        this.renderActiveScmDashboardTab();
      });
    });
  }

  // One real fetch per Dashboard visit, shared by the Analytics/
  // Trending tabs AND the permanent Recent Activity section - switching
  // tabs is a pure re-render. Settings changes trigger a fresh fetch of
  // their own.
  private async loadScmDashboardData(): Promise<void> {
    this.scmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.scmDashboardActivityEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.scmDashboardData = await fetchConsolidatedScmDashboardAnalytics();
    this.renderActiveScmDashboardTab();
    this.renderScmActivitySection(this.scmDashboardData);
  }

  private renderActiveScmDashboardTab(): void {
    if (this.activeScmDashboardTab === "settings") {
      this.renderScmSettingsTab();
      return;
    }
    if (!this.scmDashboardData) {
      return;
    }
    if (this.activeScmDashboardTab === "analytics") {
      this.renderScmAnalyticsTab(this.scmDashboardData);
    } else {
      this.renderScmTrendingTab(this.scmDashboardData);
    }
  }

  private scmNoDataHint(): string {
    const anyConnected = SCM_PROVIDER_CATALOG.some(isScmProviderConnected);
    return anyConnected
      ? "Nothing enabled - turn a provider back on in the Settings tab."
      : "Nothing connected yet - connect a provider above to see its real data here.";
  }

  // Stats render as a real single horizontal row of compact chips, same
  // "1 row, x columns" layout justjs#137 established for Socials. Only
  // one chip's drill-down shows at a time, in the shared panel below the
  // row.
  private renderScmAnalyticsTab(data: ConsolidatedScmDashboardAnalytics): void {
    if (data.metrics.length === 0 && data.unavailable.length === 0) {
      this.scmDashboardTabContentEl.innerHTML = `<p class="connect-hint">${this.scmNoDataHint()}</p>`;
      return;
    }
    const rowHtml = data.metrics
      .map((metric) => {
        const key = `${metric.providerId}:${metric.label}`;
        const active = this.expandedScmMetricKeys.has(key);
        return `
          <button type="button" class="metric-chip ${active ? "metric-chip-active" : ""}" data-metric-key="${key}">
            <span class="metric-chip-count">${metric.count}</span>
            <span class="metric-chip-label">${metric.label}</span>
            <span class="metric-chip-source">${metric.providerName}</span>
          </button>
        `;
      })
      .join("");
    const selected = data.metrics.find((m) => this.expandedScmMetricKeys.has(`${m.providerId}:${m.label}`));
    const itemsHtml = selected
      ? `<div class="metric-items">${selected.items.map((item) => `<p class="metric-item">${item.label}</p>`).join("")}</div>`
      : "";
    const unavailableHtml = data.unavailable.map((u) => `<p class="connect-hint">⚠️ ${u.message}</p>`).join("");
    this.scmDashboardTabContentEl.innerHTML = `<div class="metrics-row">${rowHtml}</div>${itemsHtml}${unavailableHtml}`;

    this.scmDashboardTabContentEl.querySelectorAll<HTMLButtonElement>("button[data-metric-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset["metricKey"]!;
        if (this.expandedScmMetricKeys.has(key)) {
          this.expandedScmMetricKeys.delete(key);
        } else {
          this.expandedScmMetricKeys.clear();
          this.expandedScmMetricKeys.add(key);
        }
        this.renderScmAnalyticsTab(data);
      });
    });
  }

  private renderScmTrendingTab(data: ConsolidatedScmDashboardAnalytics): void {
    if (data.trending.length === 0) {
      this.scmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing trending right now.</p>`;
      return;
    }
    this.scmDashboardTabContentEl.innerHTML = data.trending
      .map(
        (item) => `
          <div class="trending-item">
            <span>${item.title} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="trending-item-score">${item.score}</span>
          </div>
        `
      )
      .join("");
  }

  // Permanent - rendered once per fetch, unaffected by which of the 3
  // switchable tabs is active, same as Socials' own Recent Activity.
  private renderScmActivitySection(data: ConsolidatedScmDashboardAnalytics): void {
    if (data.recentActivity.length === 0) {
      this.scmDashboardActivityEl.innerHTML = `<p class="connect-hint">No recent activity.</p>`;
      return;
    }
    this.scmDashboardActivityEl.innerHTML = data.recentActivity
      .map(
        (item) => `
          <div class="activity-item">
            <span>${item.summary} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="activity-item-time">${formatDashboardActivityTime(item.timestamp)}</span>
          </div>
        `
      )
      .join("");
  }

  // Dashboard's own Settings tab - toggles which connected SCM providers
  // contribute to Analytics/Trending/Recent Activity. Lists only
  // connected providers - nothing to toggle for one that isn't.
  private renderScmSettingsTab(): void {
    const connected = SCM_PROVIDER_CATALOG.filter(isScmProviderConnected);
    if (connected.length === 0) {
      this.scmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing connected yet - connect a provider above, then come back here to choose what Dashboard shows.</p>`;
      return;
    }
    this.scmDashboardTabContentEl.innerHTML = `
      <p class="connect-hint">Choose which connected providers contribute to Analytics, Trending, and Recent Activity.</p>
      ${connected
        .map(
          (p) => `
            <label class="field">
              <input type="checkbox" data-settings-provider="${p.id}" ${isScmDashboardProviderEnabled(p.id) ? "checked" : ""} />
              <span class="field-label">${p.name}</span>
            </label>
          `
        )
        .join("")}
    `;
    this.scmDashboardTabContentEl.querySelectorAll<HTMLInputElement>("input[data-settings-provider]").forEach((input) => {
      input.addEventListener("change", () => {
        const enabledIds = connected
          .filter((p) => this.scmDashboardTabContentEl.querySelector<HTMLInputElement>(`input[data-settings-provider="${p.id}"]`)?.checked)
          .map((p) => p.id);
        setEnabledScmDashboardProviderIds(enabledIds);
        void this.loadScmDashboardData();
      });
    });
  }

  // ---- Requirement/Planning: project-management connections (opened
  // from Specs/User Stories/Project Boards above) - <control-provider-
  // connector>, including Jira's real OAuth-redirect flow via
  // oauthRedirect/oauthBegin. ----

  private renderPmProviders(stage: SdlcStage): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
    if (!this.pmScreen) {
      const screen = document.createElement("div");
      screen.innerHTML = `
        <div id="pm-main-view">
          <view-nav-header id="pm-header"></view-nav-header>
          <p class="connect-hint">Tap a provider to connect a real account and see its actual issues/tasks/boards. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
          <control-provider-connector id="pm-connector"></control-provider-connector>
          <view-grid id="pm-dashboard-tile-grid"></view-grid>
        </div>
        <div id="pm-dashboard-view" hidden>
          <div class="dash-subnav">
            <button id="pm-dashboard-back-btn" class="dash-back-btn" type="button">← Project Management</button>
            <h2 class="workspace-stage-title">📊 Dashboard</h2>
          </div>
          <div id="pm-dashboard-tabs" class="dashboard-tabs"></div>
          <div id="pm-dashboard-tab-content"></div>
          <p class="dashboard-section-title">🕒 Recent Activity</p>
          <div id="pm-dashboard-activity"></div>
        </div>
      `;
      const header = screen.querySelector<NavHeaderView>("#pm-header")!;
      header.icon = "📋";
      header.title = "Project Management";
      header.addEventListener("nav-back", () => {
        this.showPmConnect = false;
        this.renderView();
      });
      const connector = screen.querySelector<ProviderConnectorControl>("#pm-connector")!;
      connector.providers = PM_PROVIDER_CATALOG.map(toPmCatalogItem);
      connector.connect = handlePmConnect;
      connector.list = handlePmList;
      connector.disconnect = handlePmDisconnect;
      connector.oauthBegin = handlePmOAuthBegin;
      connector.catalogLabel = "Project Management";

      this.pmMainView = screen.querySelector<HTMLElement>("#pm-main-view")!;
      this.pmDashboardView = screen.querySelector<HTMLElement>("#pm-dashboard-view")!;
      this.pmDashboardBackBtn = screen.querySelector<HTMLButtonElement>("#pm-dashboard-back-btn")!;
      this.pmDashboardTabsEl = screen.querySelector<HTMLElement>("#pm-dashboard-tabs")!;
      this.pmDashboardTabContentEl = screen.querySelector<HTMLElement>("#pm-dashboard-tab-content")!;
      this.pmDashboardActivityEl = screen.querySelector<HTMLElement>("#pm-dashboard-activity")!;

      const dashboardTileGrid = screen.querySelector<GridView>("#pm-dashboard-tile-grid")!;
      dashboardTileGrid.items = [{ id: "dashboard", label: "Dashboard", icon: "📊" }];
      dashboardTileGrid.addEventListener("item-select", () => this.showPmDashboard());
      this.pmDashboardBackBtn.addEventListener("click", () => this.resetPmDashboardToMain());

      this.pmScreen = screen;
    }
    // Requirement's Specs/User Stories and Planning's Project Boards
    // share this one screen (PM_PROVIDER_CATALOG's own doc comment) but
    // have different "back" labels - refreshed on every entry since the
    // cached header would otherwise still say whichever stage first
    // created it. Dashboard's own back label stays fixed ("← Project
    // Management") regardless of which stage opened it, since Dashboard
    // is one level below the shared PM screen itself, not stage-specific.
    const header = this.pmScreen.querySelector<NavHeaderView>("#pm-header")!;
    header.backLabel = stage.label;
    this.subscreenView.appendChild(this.pmScreen);
  }

  private showPmDashboard(): void {
    this.pmMainView.hidden = true;
    this.pmDashboardView.hidden = false;
    this.activePmDashboardTab = "analytics";
    this.expandedPmMetricKeys.clear();
    this.renderPmDashboardTabs();
    void this.loadPmDashboardData();
  }

  // Real reset back to the main provider grid - called both by the
  // Dashboard's own back button and by the overview grid's item-select
  // handler (alongside pmConnector.resetView()), same reasoning as
  // resetScmDashboardToMain(). Safe no-op if pmScreen was never built
  // yet.
  private resetPmDashboardToMain(): void {
    if (!this.pmScreen) {
      return;
    }
    this.pmDashboardView.hidden = true;
    this.pmMainView.hidden = false;
  }

  private renderPmDashboardTabs(): void {
    this.pmDashboardTabsEl.innerHTML = DASHBOARD_TABS.map(
      (t) => `
        <button type="button" class="dashboard-tab ${t.id === this.activePmDashboardTab ? "dashboard-tab-active" : ""}" data-tab="${t.id}">
          ${t.icon} ${t.label}
        </button>
      `
    ).join("");
    this.pmDashboardTabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset["tab"] as DashboardTabId;
        if (tabId === this.activePmDashboardTab) {
          return;
        }
        this.activePmDashboardTab = tabId;
        this.renderPmDashboardTabs();
        this.renderActivePmDashboardTab();
      });
    });
  }

  private async loadPmDashboardData(): Promise<void> {
    this.pmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.pmDashboardActivityEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.pmDashboardData = await fetchConsolidatedPmDashboardAnalytics();
    this.renderActivePmDashboardTab();
    this.renderPmActivitySection(this.pmDashboardData);
  }

  private renderActivePmDashboardTab(): void {
    if (this.activePmDashboardTab === "settings") {
      this.renderPmSettingsTab();
      return;
    }
    if (!this.pmDashboardData) {
      return;
    }
    if (this.activePmDashboardTab === "analytics") {
      this.renderPmAnalyticsTab(this.pmDashboardData);
    } else {
      this.renderPmTrendingTab(this.pmDashboardData);
    }
  }

  private pmNoDataHint(): string {
    const anyConnected = PM_PROVIDER_CATALOG.some(isPmProviderConnected);
    return anyConnected
      ? "Nothing enabled - turn a provider back on in the Settings tab."
      : "Nothing connected yet - connect a provider above to see its real data here.";
  }

  private renderPmAnalyticsTab(data: ConsolidatedPmDashboardAnalytics): void {
    if (data.metrics.length === 0 && data.unavailable.length === 0) {
      this.pmDashboardTabContentEl.innerHTML = `<p class="connect-hint">${this.pmNoDataHint()}</p>`;
      return;
    }
    const rowHtml = data.metrics
      .map((metric) => {
        const key = `${metric.providerId}:${metric.label}`;
        const active = this.expandedPmMetricKeys.has(key);
        return `
          <button type="button" class="metric-chip ${active ? "metric-chip-active" : ""}" data-metric-key="${key}">
            <span class="metric-chip-count">${metric.count}</span>
            <span class="metric-chip-label">${metric.label}</span>
            <span class="metric-chip-source">${metric.providerName}</span>
          </button>
        `;
      })
      .join("");
    const selected = data.metrics.find((m) => this.expandedPmMetricKeys.has(`${m.providerId}:${m.label}`));
    const itemsHtml = selected
      ? `<div class="metric-items">${selected.items.map((item) => `<p class="metric-item">${item.label}</p>`).join("")}</div>`
      : "";
    const unavailableHtml = data.unavailable.map((u) => `<p class="connect-hint">⚠️ ${u.message}</p>`).join("");
    this.pmDashboardTabContentEl.innerHTML = `<div class="metrics-row">${rowHtml}</div>${itemsHtml}${unavailableHtml}`;

    this.pmDashboardTabContentEl.querySelectorAll<HTMLButtonElement>("button[data-metric-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset["metricKey"]!;
        if (this.expandedPmMetricKeys.has(key)) {
          this.expandedPmMetricKeys.delete(key);
        } else {
          this.expandedPmMetricKeys.clear();
          this.expandedPmMetricKeys.add(key);
        }
        this.renderPmAnalyticsTab(data);
      });
    });
  }

  private renderPmTrendingTab(data: ConsolidatedPmDashboardAnalytics): void {
    if (data.trending.length === 0) {
      this.pmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing trending right now.</p>`;
      return;
    }
    this.pmDashboardTabContentEl.innerHTML = data.trending
      .map(
        (item) => `
          <div class="trending-item">
            <span>${item.title} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="trending-item-score">${item.score}</span>
          </div>
        `
      )
      .join("");
  }

  private renderPmActivitySection(data: ConsolidatedPmDashboardAnalytics): void {
    if (data.recentActivity.length === 0) {
      this.pmDashboardActivityEl.innerHTML = `<p class="connect-hint">No recent activity.</p>`;
      return;
    }
    this.pmDashboardActivityEl.innerHTML = data.recentActivity
      .map(
        (item) => `
          <div class="activity-item">
            <span>${item.summary} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="activity-item-time">${formatDashboardActivityTime(item.timestamp)}</span>
          </div>
        `
      )
      .join("");
  }

  private renderPmSettingsTab(): void {
    const connected = PM_PROVIDER_CATALOG.filter(isPmProviderConnected);
    if (connected.length === 0) {
      this.pmDashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing connected yet - connect a provider above, then come back here to choose what Dashboard shows.</p>`;
      return;
    }
    this.pmDashboardTabContentEl.innerHTML = `
      <p class="connect-hint">Choose which connected providers contribute to Analytics, Trending, and Recent Activity.</p>
      ${connected
        .map(
          (p) => `
            <label class="field">
              <input type="checkbox" data-settings-provider="${p.id}" ${isPmDashboardProviderEnabled(p.id) ? "checked" : ""} />
              <span class="field-label">${p.name}</span>
            </label>
          `
        )
        .join("")}
    `;
    this.pmDashboardTabContentEl.querySelectorAll<HTMLInputElement>("input[data-settings-provider]").forEach((input) => {
      input.addEventListener("change", () => {
        const enabledIds = connected
          .filter((p) => this.pmDashboardTabContentEl.querySelector<HTMLInputElement>(`input[data-settings-provider="${p.id}"]`)?.checked)
          .map((p) => p.id);
        setEnabledPmDashboardProviderIds(enabledIds);
        void this.loadPmDashboardData();
      });
    });
  }

  // ---- Presentation: AI-generated slide deck (opened from Slides above) ----

  private renderPresentationGenerator(): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
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
        // the way out to the overview.
        this.showPresentationGenerator = false;
        this.renderView();
      });
      this.presentationGenerator = generator;
    }
    this.subscreenView.appendChild(this.presentationGenerator);
  }

  // ---- Development: virtual-filesystem CLI (opened from CLI above) ----

  private renderCliTerminal(): void {
    this.functionListView.hidden = true;
    this.subscreenView.hidden = false;
    this.subscreenView.innerHTML = "";
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
        // the way out to the overview.
        this.showCliTerminal = false;
        this.renderView();
      });
      terminal.addEventListener("command", (e) => {
        const action = (e as CustomEvent<{ action: AppAction }>).detail.action;
        this.store?.dispatch(action);
      });
      this.cliTerminal = terminal;
    }
    this.subscreenView.appendChild(this.cliTerminal);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-sdlc-hub")) {
  customElements.define("control-sdlc-hub", SdlcHubElement);
}
