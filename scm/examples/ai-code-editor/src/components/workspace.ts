import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { getAiAssistProvider } from "../core/ai_assist.js";
import { navigateTo } from "../core/navigation.js";
import { inferLanguage, normalizePath, pathExists } from "../core/fs.js";
import { renderMarkdownToHtml, splitMarkdownSlides } from "../core/markdown.js";
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
  readonly action?: "design-generate" | "cloud-providers" | "scm-connect" | "presentation-generate" | "cli";
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

// simple-icons ships each SVG with no `fill` set (defaults to SVG's own
// black), meant for the consumer to recolor. Injecting fill="currentColor"
// once here, then setting `color: white` on the wrapping badge (CSS),
// renders every real logo in white against its own brand-colored circle -
// one consistent treatment, not a different one per icon.
function renderProviderBadge(p: { readonly icon?: string; readonly color: string; readonly logo?: string }): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon ?? "");
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
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
// (renderCloudProviders() below). Presentation is a 9th widget appended
// after the 8 SDLC stages - it isn't itself an SDLC stage, but the user
// asked for it alongside them, so it lives in the same overview grid.
// Its one function, Slides, is real (not a stub) - a real generateSlides()
// capability (renderPresentationGenerator() below).
const SDLC_STAGES: readonly SdlcStage[] = [
  { key: "ideation", label: "Ideation", icon: "💡", functions: [{ label: "Chat", route: "/chat" }] },
  { key: "requirement", label: "Requirement", icon: "📋", functions: [{ label: "Specs" }, { label: "User Stories" }] },
  { key: "planning", label: "Planning", icon: "🗺️", functions: [{ label: "Scaffold", route: "/scaffold" }] },
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

  // Design-stage local state - component-local, not global AppState,
  // matching ScaffoldElement's own generatedFileCode/generatedProjectFiles
  // pattern: nothing here is committed to the real project until an
  // explicit "Create file" tap.
  private designDescription = "";
  private designDoc: string | null = null;
  private designViewMode: "edit" | "preview" = "edit";
  private designRenderToken = 0;
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

  // Development's Repository - the source-control equivalent of the
  // Cloud state above (see SCM_PROVIDER_CATALOG), same shape minus
  // AWS's two-field/signing special case - all 3 SCM providers are
  // single-bearer-token.
  private showScmConnect = false;
  private selectedScmProviderId: string | null = null;
  private scmResources: ScmResource[] | null = null;
  private scmConnectError: string | null = null;
  private scmConnecting = false;

  // Presentation-stage local state - same component-local pattern as
  // Design's above. slideChunks is computed by splitMarkdownSlides()
  // once per generate/edit, not re-derived on every Prev/Next tap.
  // slidesRenderToken is a separate counter from designRenderToken -
  // Design and Slides are independent drill-downs, each with their own
  // in-flight async Mermaid render to guard.
  private presentationDescription = "";
  private slidesDoc: string | null = null;
  private slideChunks: string[] = [];
  private currentSlideIndex = 0;
  private slidesViewMode: "edit" | "preview" = "edit";
  private slidesRenderToken = 0;
  private showPresentationGenerator = false;

  // Development's CLI - a real terminal against this app's own virtual
  // filesystem (core/cli.ts), component-local like every other
  // drill-down above. cliCwd is entirely separate from
  // AppState.activeFilePath (which tab the Editor has open) -
  // deliberately no coupling between the two. Each history entry keeps
  // the cwd it ran under, so historical prompt lines stay correct even
  // after cliCwd has since changed.
  private cliCwd = "";
  private cliHistory: { input: string; cwd: string; output: string; isError?: boolean }[] = [];
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
    container.innerHTML = `
      <div class="widget-grid">
        ${SDLC_STAGES.map(
          (s) => `
            <button class="widget widget-action" data-stage="${s.key}" type="button">
              <span class="widget-icon">${s.icon}</span>
              <span class="widget-label">${escapeHtml(s.label)}</span>
            </button>
          `
        ).join("")}
      </div>
    `;
    container.querySelectorAll<HTMLButtonElement>("[data-stage]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.currentStageKey = btn.dataset.stage ?? null;
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
        this.selectedScmProviderId = null;
        this.scmResources = null;
        this.scmConnectError = null;
        this.showPresentationGenerator = false;
        this.showCliTerminal = false;
        this.renderView();
      });
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
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Design</button>
        <h2 class="workspace-stage-title">🎨 Generate</h2>
      </div>
      <div class="design-form">
        <label class="field">
          <span class="field-label">Describe what to design</span>
          <textarea id="design-description" rows="4" placeholder="e.g. the auth flow for this app"></textarea>
        </label>
        <button id="design-generate-btn" type="button">Generate</button>
      </div>
      <p id="design-status" class="editor-status" hidden></p>
      <div id="design-result" class="design-result" ${this.designDoc ? "" : "hidden"}>
        <div class="design-mode-toggle">
          <button id="design-mode-edit-btn" type="button" class="design-mode-btn active">Edit</button>
          <button id="design-mode-preview-btn" type="button" class="design-mode-btn">Preview</button>
        </div>
        <textarea id="design-source" class="design-source" rows="10">${this.designDoc ? escapeHtml(this.designDoc) : ""}</textarea>
        <div id="design-preview" class="design-preview" hidden></div>
        <div class="design-create-row">
          <input id="design-file-path" type="text" value="design.md" autocomplete="off" spellcheck="false" />
          <button id="design-create-btn" type="button">Create file</button>
        </div>
        <p id="design-create-error" class="attach-image-error" hidden></p>
      </div>
    `;

    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#design-description")!;
    descriptionInput.value = this.designDescription;
    descriptionInput.addEventListener("input", () => {
      this.designDescription = descriptionInput.value;
    });

    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    sourceEl?.addEventListener("input", () => {
      this.designDoc = sourceEl.value;
    });

    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      // One level back - to Design's own Architecture/Wireframes list,
      // not all the way out to the Workspace overview (that back button,
      // in the generic function-list view above, handles that level).
      this.showDesignGenerator = false;
      this.renderView();
    });
    this.querySelector("#design-generate-btn")?.addEventListener("click", () => void this.handleGenerateDesignDoc());
    this.querySelector("#design-mode-edit-btn")?.addEventListener("click", () => void this.setDesignViewMode("edit"));
    this.querySelector("#design-mode-preview-btn")?.addEventListener("click", () => void this.setDesignViewMode("preview"));
    this.querySelector("#design-create-btn")?.addEventListener("click", () => this.handleCreateDesignFile());

    this.applyDesignViewMode();
  }

  private async handleGenerateDesignDoc(): Promise<void> {
    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#design-description");
    const generateBtn = this.querySelector<HTMLButtonElement>("#design-generate-btn");
    const resultBox = this.querySelector<HTMLElement>("#design-result");
    if (!descriptionInput || !generateBtn || !resultBox) {
      return;
    }
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showDesignStatus("⚠️ Add an Anthropic API key in Settings to generate a design doc.");
      return;
    }
    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.showDesignStatus("Generating…");
    try {
      const doc = await provider.generateDesignDoc({ description });
      this.designDoc = doc;
      this.designViewMode = "edit";
      const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
      if (sourceEl) {
        sourceEl.value = doc;
      }
      resultBox.hidden = false;
      this.applyDesignViewMode();
      this.hideDesignStatus();
    } catch (e) {
      this.showDesignStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  private applyDesignViewMode(): void {
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    const previewEl = this.querySelector<HTMLElement>("#design-preview");
    const editBtn = this.querySelector<HTMLButtonElement>("#design-mode-edit-btn");
    const previewBtn = this.querySelector<HTMLButtonElement>("#design-mode-preview-btn");
    if (!sourceEl || !previewEl || !editBtn || !previewBtn) {
      return;
    }
    const isPreview = this.designViewMode === "preview";
    sourceEl.hidden = isPreview;
    previewEl.hidden = !isPreview;
    editBtn.classList.toggle("active", !isPreview);
    previewBtn.classList.toggle("active", isPreview);
  }

  private async setDesignViewMode(mode: "edit" | "preview"): Promise<void> {
    if (mode === "edit") {
      this.designViewMode = "edit";
      this.applyDesignViewMode();
      return;
    }
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    if (!sourceEl) {
      return;
    }
    this.designDoc = sourceEl.value;
    this.designViewMode = "preview";
    this.applyDesignViewMode();
    const previewEl = this.querySelector<HTMLElement>("#design-preview");
    if (previewEl) {
      previewEl.innerHTML = `<p class="editor-status">Rendering…</p>`;
    }
    // The user may switch back to Edit, or even navigate away and
    // regenerate an entirely new doc, while this async render (real
    // Mermaid rendering can take real time) is still in flight - a
    // token guard, not just a designViewMode check, since navigating
    // away and back could coincidentally leave designViewMode as
    // "preview" again by the time this resolves, for a DIFFERENT doc.
    const token = ++this.designRenderToken;
    const html = await renderMarkdownToHtml(this.designDoc ?? "");
    if (token !== this.designRenderToken) {
      return;
    }
    const currentPreviewEl = this.querySelector<HTMLElement>("#design-preview");
    if (this.designViewMode === "preview" && currentPreviewEl) {
      currentPreviewEl.innerHTML = html;
    }
  }

  private handleCreateDesignFile(): void {
    if (!this.store) {
      return;
    }
    const pathInput = this.querySelector<HTMLInputElement>("#design-file-path");
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#design-source");
    const errorEl = this.querySelector<HTMLElement>("#design-create-error");
    if (!pathInput || !sourceEl || !errorEl) {
      return;
    }
    const path = normalizePath(pathInput.value);
    if (!path) {
      errorEl.hidden = false;
      errorEl.textContent = "Enter a path before creating the file.";
      return;
    }
    const state = this.store.state.value;
    if (pathExists(state.files, state.emptyFolders, path)) {
      errorEl.hidden = false;
      errorEl.textContent = `"${path}" already exists - choose a different path.`;
      return;
    }
    errorEl.hidden = true;
    this.store.dispatch({ type: "CREATE_FILE", path, content: sourceEl.value, language: inferLanguage(path) });
    navigateTo("/editor");
  }

  private showDesignStatus(text: string): void {
    const el = this.querySelector<HTMLElement>("#design-status");
    if (!el) {
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  private hideDesignStatus(): void {
    const el = this.querySelector<HTMLElement>("#design-status");
    if (el) {
      el.hidden = true;
    }
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
              ${renderProviderBadge(p)}
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
  }

  // ---- Deployment: a single provider's own connect screen (opened from the grid above) ----

  private renderCloudProviderDetail(container: Element, provider: CloudProvider): void {
    const connected = this.isCloudProviderConnected(provider);
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="cloud-provider-back-btn" class="dash-back-btn" type="button">← Cloud Providers</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} ${escapeHtml(provider.name)}</h2>
      </div>
      ${this.renderCloudProviderBody(provider, connected)}
    `;

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

  // ---- Development: source-control connections (opened from Repository above) ----
  // Same real-connect shape as Deployment's Cloud above, minus AWS's
  // two-field/signing special case - all 3 SCM providers are
  // single-bearer-token, so there's no "kind" branching needed here.

  private isScmProviderConnected(p: ScmProvider): boolean {
    return getStoredScmToken(p.id).length > 0;
  }

  private renderScmProviders(container: Element): void {
    if (this.selectedScmProviderId) {
      const provider = SCM_PROVIDER_CATALOG.find((p) => p.id === this.selectedScmProviderId);
      if (provider) {
        this.renderScmProviderDetail(container, provider);
        return;
      }
      this.selectedScmProviderId = null;
    }

    container.innerHTML = `
      <div class="dash-subnav">
        <button id="scm-back-btn" class="dash-back-btn" type="button">← Development</button>
        <h2 class="workspace-stage-title">📦 Repository</h2>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual repositories. Tokens are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
      <div class="provider-grid">
        ${SCM_PROVIDER_CATALOG.map((p) => {
          const connected = this.isScmProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-scm-provider-id="${p.id}">
              ${renderProviderBadge(p)}
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelector("#scm-back-btn")?.addEventListener("click", () => {
      this.showScmConnect = false;
      this.renderView();
    });

    container.querySelectorAll<HTMLButtonElement>("[data-scm-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.scmProviderId;
        if (!id) {
          return;
        }
        this.selectedScmProviderId = id;
        this.scmResources = null;
        this.scmConnectError = null;
        this.renderView();
      });
    });
  }

  private renderScmProviderDetail(container: Element, provider: ScmProvider): void {
    const connected = this.isScmProviderConnected(provider);
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="scm-provider-back-btn" class="dash-back-btn" type="button">← Repository</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} ${escapeHtml(provider.name)}</h2>
      </div>
      <p class="settings-disclosure">Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.</p>
      <div class="connect-form">
        <input id="scm-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} token" autocomplete="off" spellcheck="false" />
        <div class="connect-actions">
          <button id="scm-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="scm-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="scm-connect-status" class="connect-status${this.scmConnectError ? " connect-status-error" : ""}">${this.scmConnecting ? "Connecting…" : this.scmConnectError ? `⚠️ ${escapeHtml(this.scmConnectError)}` : ""}</p>
      </div>
      ${this.renderScmResourceList()}
    `;

    this.querySelector("#scm-provider-back-btn")?.addEventListener("click", () => {
      this.selectedScmProviderId = null;
      this.renderView();
    });
    this.querySelector("#scm-connect-btn")?.addEventListener("click", () => {
      void this.handleScmConnect(provider);
    });
    this.querySelector("#scm-disconnect-btn")?.addEventListener("click", () => {
      setStoredScmToken(provider.id, "");
      this.scmResources = null;
      this.scmConnectError = null;
      this.renderView();
    });

    // Already connected (a token was saved in a previous session) and
    // nothing fetched yet this visit - fetch automatically, same
    // lazy-validation posture as renderCloudProviderDetail() above.
    if (connected && !this.scmResources && !this.scmConnectError && !this.scmConnecting) {
      void this.handleScmConnect(provider);
    }
  }

  private renderScmResourceList(): string {
    if (!this.scmResources) {
      return "";
    }
    const rows =
      this.scmResources.length === 0
        ? `<p class="connect-hint">Connected - no repositories found on this account.</p>`
        : `<ul class="resource-list">
            ${this.scmResources
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
    return `<h3 class="resource-list-label">Repositories</h3>${rows}`;
  }

  private async handleScmConnect(provider: ScmProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#scm-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#scm-connect-btn");
    const tokenInput = this.querySelector<HTMLInputElement>("#scm-connect-token");
    const token = tokenInput?.value.trim() || getStoredScmToken(provider.id);
    if (!token) {
      this.scmConnectError = "Paste a token first.";
      this.renderView();
      return;
    }

    this.scmConnecting = true;
    this.scmConnectError = null;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Connecting…";
    }
    try {
      const resources = await SCM_CONNECTORS[provider.id]!(token);
      setStoredScmToken(provider.id, token);
      this.scmResources = resources;
      this.scmConnectError = null;
    } catch (e) {
      this.scmConnectError = e instanceof Error ? e.message : String(e);
      this.scmResources = null;
    } finally {
      this.scmConnecting = false;
      this.renderView();
    }
  }

  // ---- Presentation: AI-generated slide deck (opened from Slides above) ----

  private renderPresentationGenerator(container: Element): void {
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="workspace-back-btn" class="dash-back-btn" type="button">← Presentation</button>
        <h2 class="workspace-stage-title">📽️ Generate</h2>
      </div>
      <div class="design-form">
        <label class="field">
          <span class="field-label">Describe the presentation</span>
          <textarea id="slides-description" rows="4" placeholder="e.g. pitch this app to a new team"></textarea>
        </label>
        <button id="slides-generate-btn" type="button">Generate</button>
      </div>
      <p id="slides-status" class="editor-status" hidden></p>
      <div id="slides-result" class="design-result" ${this.slidesDoc ? "" : "hidden"}>
        <div class="design-mode-toggle">
          <button id="slides-mode-edit-btn" type="button" class="design-mode-btn active">Edit</button>
          <button id="slides-mode-preview-btn" type="button" class="design-mode-btn">Preview</button>
        </div>
        <textarea id="slides-source" class="design-source" rows="10">${this.slidesDoc ? escapeHtml(this.slidesDoc) : ""}</textarea>
        <div id="slides-preview-wrap" class="slides-preview-wrap" hidden>
          <div class="slides-nav">
            <button id="slides-prev-btn" type="button" class="slides-nav-btn">◀ Prev</button>
            <span id="slides-indicator" class="slides-indicator"></span>
            <button id="slides-next-btn" type="button" class="slides-nav-btn">Next ▶</button>
          </div>
          <div id="slides-preview" class="design-preview slides-preview"></div>
        </div>
        <div class="design-create-row">
          <input id="slides-file-path" type="text" value="slides.md" autocomplete="off" spellcheck="false" />
          <button id="slides-create-btn" type="button">Create file</button>
        </div>
        <p id="slides-create-error" class="attach-image-error" hidden></p>
      </div>
    `;

    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#slides-description")!;
    descriptionInput.value = this.presentationDescription;
    descriptionInput.addEventListener("input", () => {
      this.presentationDescription = descriptionInput.value;
    });

    const sourceEl = this.querySelector<HTMLTextAreaElement>("#slides-source");
    sourceEl?.addEventListener("input", () => {
      this.slidesDoc = sourceEl.value;
    });

    this.querySelector("#workspace-back-btn")?.addEventListener("click", () => {
      // One level back - to Presentation's own function list, not all
      // the way out to the Workspace overview.
      this.showPresentationGenerator = false;
      this.renderView();
    });
    this.querySelector("#slides-generate-btn")?.addEventListener("click", () => void this.handleGenerateSlides());
    this.querySelector("#slides-mode-edit-btn")?.addEventListener("click", () => void this.setPresentationViewMode("edit"));
    this.querySelector("#slides-mode-preview-btn")?.addEventListener("click", () => void this.setPresentationViewMode("preview"));
    this.querySelector("#slides-prev-btn")?.addEventListener("click", () => this.goToSlide(-1));
    this.querySelector("#slides-next-btn")?.addEventListener("click", () => this.goToSlide(1));
    this.querySelector("#slides-create-btn")?.addEventListener("click", () => this.handleCreateSlidesFile());

    this.applyPresentationViewMode();
    this.updateSlidesNavUI();
  }

  private async handleGenerateSlides(): Promise<void> {
    const descriptionInput = this.querySelector<HTMLTextAreaElement>("#slides-description");
    const generateBtn = this.querySelector<HTMLButtonElement>("#slides-generate-btn");
    const resultBox = this.querySelector<HTMLElement>("#slides-result");
    if (!descriptionInput || !generateBtn || !resultBox) {
      return;
    }
    const description = descriptionInput.value.trim();
    if (!description) {
      return;
    }
    const provider = getAiAssistProvider();
    if (!provider) {
      this.showPresentationStatus("⚠️ Add an Anthropic API key in Settings to generate a presentation.");
      return;
    }
    generateBtn.disabled = true;
    resultBox.hidden = true;
    this.showPresentationStatus("Generating…");
    try {
      const doc = await provider.generateSlides({ description });
      this.slidesDoc = doc;
      this.slideChunks = splitMarkdownSlides(doc);
      this.currentSlideIndex = 0;
      this.slidesViewMode = "edit";
      const sourceEl = this.querySelector<HTMLTextAreaElement>("#slides-source");
      if (sourceEl) {
        sourceEl.value = doc;
      }
      resultBox.hidden = false;
      this.applyPresentationViewMode();
      this.updateSlidesNavUI();
      this.hidePresentationStatus();
    } catch (e) {
      this.showPresentationStatus(`⚠️ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      generateBtn.disabled = false;
    }
  }

  private applyPresentationViewMode(): void {
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#slides-source");
    const previewWrapEl = this.querySelector<HTMLElement>("#slides-preview-wrap");
    const editBtn = this.querySelector<HTMLButtonElement>("#slides-mode-edit-btn");
    const previewBtn = this.querySelector<HTMLButtonElement>("#slides-mode-preview-btn");
    if (!sourceEl || !previewWrapEl || !editBtn || !previewBtn) {
      return;
    }
    const isPreview = this.slidesViewMode === "preview";
    sourceEl.hidden = isPreview;
    previewWrapEl.hidden = !isPreview;
    editBtn.classList.toggle("active", !isPreview);
    previewBtn.classList.toggle("active", isPreview);
  }

  private async setPresentationViewMode(mode: "edit" | "preview"): Promise<void> {
    if (mode === "edit") {
      this.slidesViewMode = "edit";
      this.applyPresentationViewMode();
      return;
    }
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#slides-source");
    if (!sourceEl) {
      return;
    }
    // Re-sync from the textarea and recompute slides first - an edit may
    // have changed the slide count entirely, so the previous
    // currentSlideIndex can't be trusted to still point at the same
    // logical slide.
    this.slidesDoc = sourceEl.value;
    this.slideChunks = splitMarkdownSlides(this.slidesDoc);
    this.currentSlideIndex = 0;
    this.slidesViewMode = "preview";
    this.applyPresentationViewMode();
    this.updateSlidesNavUI();
    await this.renderCurrentSlide();
  }

  private goToSlide(delta: number): void {
    const nextIndex = this.currentSlideIndex + delta;
    if (nextIndex < 0 || nextIndex >= this.slideChunks.length) {
      return;
    }
    this.currentSlideIndex = nextIndex;
    this.updateSlidesNavUI();
    void this.renderCurrentSlide();
  }

  private updateSlidesNavUI(): void {
    const indicator = this.querySelector<HTMLElement>("#slides-indicator");
    const prevBtn = this.querySelector<HTMLButtonElement>("#slides-prev-btn");
    const nextBtn = this.querySelector<HTMLButtonElement>("#slides-next-btn");
    const total = this.slideChunks.length;
    if (indicator) {
      indicator.textContent = total > 0 ? `Slide ${this.currentSlideIndex + 1} of ${total}` : "";
    }
    if (prevBtn) {
      prevBtn.disabled = this.currentSlideIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = this.currentSlideIndex >= total - 1;
    }
  }

  private async renderCurrentSlide(): Promise<void> {
    const previewEl = this.querySelector<HTMLElement>("#slides-preview");
    if (previewEl) {
      previewEl.innerHTML = `<p class="editor-status">Rendering…</p>`;
    }
    // Same token-guard reasoning as Design's setDesignViewMode() - the
    // user can tap Next/Prev again, or even regenerate an entirely new
    // deck, while a real Mermaid render for the PREVIOUS slide is still
    // in flight.
    const token = ++this.slidesRenderToken;
    const slide = this.slideChunks[this.currentSlideIndex] ?? "";
    const html = await renderMarkdownToHtml(slide);
    if (token !== this.slidesRenderToken) {
      return;
    }
    const currentPreviewEl = this.querySelector<HTMLElement>("#slides-preview");
    if (this.slidesViewMode === "preview" && currentPreviewEl) {
      currentPreviewEl.innerHTML = html;
    }
  }

  private handleCreateSlidesFile(): void {
    if (!this.store) {
      return;
    }
    const pathInput = this.querySelector<HTMLInputElement>("#slides-file-path");
    const sourceEl = this.querySelector<HTMLTextAreaElement>("#slides-source");
    const errorEl = this.querySelector<HTMLElement>("#slides-create-error");
    if (!pathInput || !sourceEl || !errorEl) {
      return;
    }
    const path = normalizePath(pathInput.value);
    if (!path) {
      errorEl.hidden = false;
      errorEl.textContent = "Enter a path before creating the file.";
      return;
    }
    const state = this.store.state.value;
    if (pathExists(state.files, state.emptyFolders, path)) {
      errorEl.hidden = false;
      errorEl.textContent = `"${path}" already exists - choose a different path.`;
      return;
    }
    errorEl.hidden = true;
    this.store.dispatch({ type: "CREATE_FILE", path, content: sourceEl.value, language: inferLanguage(path) });
    navigateTo("/editor");
  }

  private showPresentationStatus(text: string): void {
    const el = this.querySelector<HTMLElement>("#slides-status");
    if (!el) {
      return;
    }
    el.hidden = false;
    el.textContent = text;
  }

  private hidePresentationStatus(): void {
    const el = this.querySelector<HTMLElement>("#slides-status");
    if (el) {
      el.hidden = true;
    }
  }

  // ---- Development: virtual-filesystem CLI (opened from CLI above) ----

  private cliPrompt(cwd: string): string {
    return `${cwd ? `/${cwd}` : "/"}$`;
  }

  private renderCliTerminal(container: Element): void {
    container.innerHTML = `
      <div class="dash-subnav">
        <button id="cli-back-btn" class="dash-back-btn" type="button">← Development</button>
        <h2 class="workspace-stage-title">💻 CLI</h2>
      </div>
      <div id="cli-transcript" class="cli-transcript">
        ${this.cliHistory
          .map(
            (entry) => `
          <div class="cli-entry">
            <div class="cli-entry-prompt">${escapeHtml(this.cliPrompt(entry.cwd))} ${escapeHtml(entry.input)}</div>
            ${entry.output ? `<pre class="cli-entry-output${entry.isError ? " cli-entry-error" : ""}">${escapeHtml(entry.output)}</pre>` : ""}
          </div>
        `
          )
          .join("")}
      </div>
      <div class="cli-input-row">
        <span class="cli-prompt">${escapeHtml(this.cliPrompt(this.cliCwd))}</span>
        <input id="cli-input" type="text" autocomplete="off" spellcheck="false" placeholder="help" />
        <button id="cli-run-btn" type="button">Run</button>
      </div>
    `;

    this.querySelector("#cli-back-btn")?.addEventListener("click", () => {
      // One level back - to Development's own function list, not all
      // the way out to the Workspace overview.
      this.showCliTerminal = false;
      this.renderView();
    });

    const input = this.querySelector<HTMLInputElement>("#cli-input");
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.handleRunCliCommand();
      }
    });
    this.querySelector("#cli-run-btn")?.addEventListener("click", () => this.handleRunCliCommand());
    input?.focus();

    const transcript = this.querySelector<HTMLElement>("#cli-transcript");
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }

  private handleRunCliCommand(): void {
    const input = this.querySelector<HTMLInputElement>("#cli-input");
    if (!input || !this.store) {
      return;
    }
    const trimmed = input.value.trim();
    if (!trimmed) {
      return;
    }
    // A client-side terminal built-in, not a real filesystem command -
    // matches how real terminal emulators handle `clear` (wipes the
    // screen, leaves no trace in the transcript), same reasoning
    // core/cli.ts itself is never consulted for it.
    if (trimmed === "clear") {
      this.cliHistory = [];
      this.renderView();
      return;
    }
    const state = this.store.state.value;
    const result = runCliCommand(trimmed, this.cliCwd, state.files, state.emptyFolders);
    this.cliHistory = [
      ...this.cliHistory,
      {
        input: trimmed,
        cwd: this.cliCwd,
        output: result.output,
        ...(result.isError !== undefined ? { isError: result.isError } : {}),
      },
    ];
    this.cliCwd = result.cwd;
    if (result.action) {
      this.store.dispatch(result.action);
    }
    this.renderView();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-workspace")) {
  customElements.define("x-workspace", WorkspaceElement);
}
