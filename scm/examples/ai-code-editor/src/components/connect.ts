import "@justjs/component-view";
import type { GridView } from "@justjs/component-view";
import { ConnectBase } from "../features/connect/connect_component.gen.js";
import "./communication.js";
import "./socials.js";
import "./cartoon.js";
import { COMMS_PROVIDER_CATALOG } from "./communication.js";
import type { CommsProvider } from "./communication.js";
import { getStoredCommsToken } from "../core/comms_credentials.js";
import { SOCIAL_PROVIDER_CATALOG, isProviderConnected as isSocialProviderConnected } from "./socials.js";
import type { SocialProvider } from "./socials.js";
import { getStoredAgentAccess, setStoredAgentAccess } from "../core/agent_access.js";

interface ConnectSection {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly tag: "x-communication" | "x-socials" | "x-cartoon";
}

// Same 3 destinations previously reachable as their own top-level tabs
// (direct user request: merge Communication + Socials, and this app's
// own pre-existing nav grouping already clustered Cartoon alongside
// them under one "connect" group too) - now one widget grid, same
// grid-then-drill-down shape Home's own SDLC hub uses.
const SECTIONS: readonly ConnectSection[] = [
  { id: "communication", label: "Comms", icon: "📣", tag: "x-communication" },
  { id: "socials", label: "Socials", icon: "🌐", tag: "x-socials" },
  { id: "cartoon", label: "Cartoon", icon: "🎨", tag: "x-cartoon" },
];

// "agent" is a 4th grid tile but not a 4th ConnectSection - unlike the 3
// above, it has no own custom-element/feature (no message threads, no
// resource lists to fetch) and is instead a plain static form, the same
// "permanent sibling, toggled via hidden" shape communication.ts's own
// Settings screen already uses, rather than a whole new mounted element.
const AGENT_TILE = { id: "agent", label: "Agent", icon: "🤖" } as const;

interface AgentCheckboxRow {
  readonly kind: "comms" | "socials";
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly connected: boolean;
}

function commsRows(): AgentCheckboxRow[] {
  return COMMS_PROVIDER_CATALOG.map((p: CommsProvider) => ({
    kind: "comms" as const,
    id: p.id,
    name: p.name,
    icon: p.icon,
    connected: getStoredCommsToken(p.id).length > 0,
  }));
}

// Excludes "unsupported" providers (X/LinkedIn) - there is no real
// connect flow for either, so there is nothing an agent could ever be
// authorized to use there.
function socialRows(): AgentCheckboxRow[] {
  return SOCIAL_PROVIDER_CATALOG.filter((p: SocialProvider) => p.kind !== "unsupported").map((p: SocialProvider) => ({
    kind: "socials" as const,
    id: p.id,
    name: p.name,
    icon: p.icon,
    connected: isSocialProviderConnected(p),
  }));
}

// Merged umbrella for the 3 third-party-provider-connector tabs. Each
// destination (<x-communication>/<x-socials>/<x-cartoon>) is mounted
// unmodified - none of their own internal logic changed - Connect is
// only a thin host: a 3-tile grid + one back button + 3 permanent
// subscreen wrappers, exactly mirroring the SDLC hub's own overview-
// grid/subscreen-view shape (see sdlc_hub.ts).
//
// The 3 children are cached and never detached (toggle `hidden` only,
// never clear innerHTML and re-append) - they're each still a genuine,
// self-contained custom element that rebuilds its own innerHTML fresh
// in connectedCallback(), so a real detach/reattach would silently wipe
// any in-progress, not-yet-submitted state (e.g. Cartoon's typed prompt,
// Communication's token input) even though their own JS-field state
// would otherwise survive. This is the same guarantee they got for free
// as top-level keepAlive: true routes before this merge.
export class ConnectElement extends ConnectBase {
  private overviewGrid!: GridView;
  private backBtn!: HTMLButtonElement;
  private subscreenView!: HTMLElement;
  private agentView!: HTMLElement;
  private agentForm!: HTMLElement;
  private agentBackBtn!: HTMLButtonElement;
  private readonly sectionEls = new Map<string, HTMLElement>();
  private currentSectionId: string | null = null;

  connectedCallback(): void {
    this.innerHTML = `
      <div id="connect-view" data-part="content">
        <view-grid id="connect-overview-grid"></view-grid>
        <div id="connect-subscreen-view" hidden>
          <div class="dash-subnav">
            <button id="connect-back-btn" class="dash-back-btn" type="button">← Connect</button>
          </div>
        </div>
        <div id="connect-agent-view" hidden>
          <div class="dash-subnav">
            <button id="connect-agent-back-btn" class="dash-back-btn" type="button">← Connect</button>
            <h2 class="workspace-stage-title">🤖 Agent</h2>
          </div>
          <p class="connect-hint">Choose which connected Comms/Socials channels Chat's Agent mode is allowed to use. A channel only reaches the agent once it's both connected below <em>and</em> enabled here - enabling one you haven't connected yet does nothing until you connect it. Once enabled, the agent can list channels, read real messages, and send a message or post (Mastodon/Bluesky) - sending/posting always pauses for your explicit confirmation first, showing the real destination and text, never silent.</p>
          <div class="connect-form" id="connect-agent-form"></div>
        </div>
      </div>
    `;
    // Binds this.content via the real data-part lookup - must run after
    // the markup above exists, since ConnectBase's own connectedCallback()
    // calls _bindElements() synchronously.
    super.connectedCallback();

    this.overviewGrid = this.querySelector<GridView>("#connect-overview-grid")!;
    this.backBtn = this.querySelector<HTMLButtonElement>("#connect-back-btn")!;
    this.subscreenView = this.querySelector<HTMLElement>("#connect-subscreen-view")!;
    this.agentView = this.querySelector<HTMLElement>("#connect-agent-view")!;
    this.agentForm = this.querySelector<HTMLElement>("#connect-agent-form")!;
    this.agentBackBtn = this.querySelector<HTMLButtonElement>("#connect-agent-back-btn")!;

    this.overviewGrid.items = [...SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon })), AGENT_TILE];
    this.overviewGrid.addEventListener("item-select", (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      if (id === AGENT_TILE.id) {
        this.showAgent();
      } else {
        this.showSection(id);
      }
    });
    this.backBtn.addEventListener("click", () => this.showOverview());
    this.agentBackBtn.addEventListener("click", () => this.showOverview());
  }

  // Rebuilt fresh every time the Agent tile is opened - connected status
  // can have changed since the last visit (e.g. the user just connected
  // Slack in the Comms subscreen) - a real re-render, not a stale cache.
  private renderAgentForm(): void {
    const access = getStoredAgentAccess();
    const rows: readonly [string, AgentCheckboxRow[]][] = [
      ["Comms", commsRows()],
      ["Socials", socialRows()],
    ];
    this.agentForm.innerHTML = rows
      .map(
        ([groupLabel, groupRows]) => `
          <p class="field-label">${groupLabel}</p>
          ${groupRows
            .map((r) => {
              const enabledIds = r.kind === "comms" ? access.commsProviderIds : access.socialsProviderIds;
              const checked = enabledIds.includes(r.id);
              const disabled = !r.connected;
              return `
                <label class="field">
                  <input type="checkbox" data-agent-channel="${r.kind}:${r.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
                  <span class="field-label">${r.icon} ${r.name}${r.connected ? "" : " — not connected"}</span>
                </label>
              `;
            })
            .join("")}
        `
      )
      .join("");

    this.agentForm.querySelectorAll<HTMLInputElement>("input[data-agent-channel]").forEach((input) => {
      input.addEventListener("change", () => {
        const [kind, id] = input.dataset["agentChannel"]!.split(":") as ["comms" | "socials", string];
        const current = getStoredAgentAccess();
        const key = kind === "comms" ? "commsProviderIds" : "socialsProviderIds";
        const nextIds = input.checked ? [...current[key], id] : current[key].filter((existing) => existing !== id);
        setStoredAgentAccess({ ...current, [key]: nextIds });
      });
    });
  }

  private showAgent(): void {
    this.currentSectionId = null;
    this.overviewGrid.hidden = true;
    this.subscreenView.hidden = true;
    this.agentView.hidden = false;
    this.renderAgentForm();
  }

  private showSection(sectionId: string): void {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) {
      return;
    }
    this.currentSectionId = sectionId;
    this.overviewGrid.hidden = true;
    this.agentView.hidden = true;
    this.subscreenView.hidden = false;

    let el = this.sectionEls.get(sectionId);
    if (!el) {
      el = document.createElement(section.tag);
      this.sectionEls.set(sectionId, el);
      this.subscreenView.appendChild(el);
    }
    // Every other cached section stays in the DOM (never detached, see
    // the class-level comment above) but must be hidden - only the
    // current one is visible.
    for (const [id, cachedEl] of this.sectionEls) {
      cachedEl.hidden = id !== sectionId;
    }
  }

  private showOverview(): void {
    this.currentSectionId = null;
    this.subscreenView.hidden = true;
    this.agentView.hidden = true;
    this.overviewGrid.hidden = false;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-connect")) {
  customElements.define("x-connect", ConnectElement);
}
