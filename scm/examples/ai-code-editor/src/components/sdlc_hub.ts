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
import {
  gcpLogo,
  digitaloceanLogo,
  cloudflareLogo,
  vercelLogo,
  netlifyLogo,
  githubLogo,
  gitlabLogo,
  bitbucketLogo,
  linearLogo,
  asanaLogo,
  trelloLogo,
  jiraLogo,
} from "../core/brand_logos.js";
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

// <control-cloud-connector> (app-local sibling to
// <control-provider-connector> - Cloud's real extra actions don't fit
// the shared package's own scope, see cloud_connector.ts's own doc
// comment) covers this shape. CloudResource{id,name,status} already
// matches ListItem's shape exactly, same precedent SCM/PM's own real
// usage established.
function isCloudProviderConnected(p: CloudProvider): boolean {
  return p.kind === "aws" ? getStoredAwsCredentials() !== null : getStoredCloudToken(p.id).length > 0;
}

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

interface ScmProvider {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly logo: string;
  // "deviceFlow" (GitHub only, justjs#135) signs in via GitHub's OAuth
  // Device Authorization Flow - no token to paste, no redirect URI
  // (works in the packaged Android WebView, unlike Jira's redirect-based
  // flow). GitLab/Bitbucket stay "bearer" - GitLab also supports device
  // flow but is a follow-up, not this pass; Bitbucket's OAuth is
  // redirect-only, out of scope for the same reason Jira's redirect flow
  // doesn't fit here.
  readonly kind: "bearer" | "deviceFlow";
}

// A real, recognizable set of actual source-control providers - all 3
// are in simple-icons' catalog for real, so no emoji-monogram fallback
// is needed here (unlike CLOUD_PROVIDER_CATALOG's AWS/Azure/Heroku
// gap).
const SCM_PROVIDER_CATALOG: readonly ScmProvider[] = [
  { id: "github", name: "GitHub", color: "#181717", logo: githubLogo, kind: "deviceFlow" },
  { id: "gitlab", name: "GitLab", color: "#FC6D26", logo: gitlabLogo, kind: "bearer" },
  { id: "bitbucket", name: "Bitbucket", color: "#0052CC", logo: bitbucketLogo, kind: "bearer" },
];

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
  // Same caching/reset-on-stage-switch/no-public-reset-API reasoning as
  // scmScreen/pmScreen.
  private showCloudProviders = false;
  private cloudScreen: HTMLElement | undefined;

  // Development's Repository - <control-provider-connector>, which owns
  // which-provider-is-selected/fetched-resources state internally.
  // scmScreen caches the whole composed wrapper (header + hint +
  // connector) so that state (and grid<->detail position) survives
  // leaving and re-entering Repository within Development, and across
  // tab switches - but the control has no public reset API, so
  // renderOverview's item-select handler below discards this reference
  // entirely (forcing a fresh instance next visit) to preserve the
  // original's own reset-on-stage-switch behavior for
  // selectedScmProviderId/scmResources.
  private showScmConnect = false;
  private scmScreen: HTMLElement | undefined;

  // Requirement's/Planning's project-management connections -
  // <control-provider-connector>, same caching/reset-on-stage-switch
  // reasoning as scmScreen above. pmScreen is shared across both stages
  // (one real capability, not two separate ones) - its own back-button
  // label is refreshed on every renderPmProviders() call since the two
  // entry stages have different labels ("← Requirement" vs
  // "← Planning"), unlike scmScreen's single fixed "← Development".
  private showPmConnect = false;
  private pmScreen: HTMLElement | undefined;

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
      // No public reset API on CloudConnectorControl either - same
      // discard-and-recreate reasoning as scmScreen/pmScreen.
      this.cloudScreen = undefined;
      this.showScmConnect = false;
      // No public reset API on ProviderConnectorControl - discarding the
      // cached wrapper is the only way to force a fresh grid view.
      this.scmScreen = undefined;
      this.showPmConnect = false;
      this.pmScreen = undefined;
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
        <view-nav-header id="cloud-header"></view-nav-header>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual resources. Tokens/credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none). See each provider's own connect screen for the exact security tradeoff.</p>
        <control-cloud-connector id="cloud-connector"></control-cloud-connector>
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
      this.cloudScreen = screen;
    }
    this.subscreenView.appendChild(this.cloudScreen);
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
        <view-nav-header id="scm-header"></view-nav-header>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual repositories. GitLab/Bitbucket tokens are stored only on this device, sent directly to that provider. GitHub signs in via a real OAuth device flow instead of a pasted token - the code request and sign-in poll relay through a small local service (scm/bo, justjs#135) only to add the CORS headers GitHub's own endpoints don't send; it never sees or stores your token, and every actual repository call still goes straight from this device to GitHub, unproxied.</p>
        <control-provider-connector id="scm-connector"></control-provider-connector>
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
      this.scmScreen = screen;
    }
    this.subscreenView.appendChild(this.scmScreen);
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
        <view-nav-header id="pm-header"></view-nav-header>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual issues/tasks/boards. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-provider-connector id="pm-connector"></control-provider-connector>
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
      this.pmScreen = screen;
    }
    // Requirement's Specs/User Stories and Planning's Project Boards
    // share this one screen (PM_PROVIDER_CATALOG's own doc comment) but
    // have different "back" labels - refreshed on every entry since the
    // cached header would otherwise still say whichever stage first
    // created it.
    const header = this.pmScreen.querySelector<NavHeaderView>("#pm-header")!;
    header.backLabel = stage.label;
    this.subscreenView.appendChild(this.pmScreen);
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
