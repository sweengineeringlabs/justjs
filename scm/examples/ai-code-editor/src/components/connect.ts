import "@justjs/component-view";
import type { GridView } from "@justjs/component-view";
import { ConnectBase } from "../features/connect/connect_component.gen.js";
import "./communication.js";
import "./socials.js";
import "./cartoon.js";
import { COMMS_PROVIDER_CATALOG } from "../core/comms_catalog.js";
import type { CommsProvider } from "../core/comms_catalog.js";
import { getStoredCommsToken } from "../core/comms_credentials.js";
import { connectSlack, connectDiscord, connectTeams, listDiscordChannels, listTeamsChannels } from "../core/comms_connect.js";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderConnected } from "../core/socials_catalog.js";
import type { SocialProvider } from "../core/socials_catalog.js";
import { getStoredAgentAccess, setStoredAgentAccess } from "../core/agent_access.js";
import type { AgentChannelRef } from "../core/agent_access.js";

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

// Real channel fetch, per provider - Slack's own connect() already
// returns channels directly; Discord/Teams are one real level shallower
// (guild/team first), so every guild's/team's real channels are fetched
// and flattened, each tagged with its parent's name for clarity in the
// picker below. No caching beyond one render pass - see
// renderCommsChannelPicker()'s own comment for why.
async function fetchCommsChannels(providerId: string): Promise<AgentChannelRef[]> {
  const token = getStoredCommsToken(providerId);
  if (providerId === "slack") {
    const channels = await connectSlack(token);
    return channels.map((c) => ({ id: c.id, name: c.name }));
  }
  if (providerId === "discord") {
    const guilds = await connectDiscord(token);
    const all: AgentChannelRef[] = [];
    for (const guild of guilds) {
      const channels = await listDiscordChannels(token, guild.id);
      all.push(...channels.map((c) => ({ id: c.id, name: `${c.name} (${guild.name})` })));
    }
    return all;
  }
  if (providerId === "teams") {
    const teams = await connectTeams(token);
    const all: AgentChannelRef[] = [];
    for (const team of teams) {
      const channels = await listTeamsChannels(token, team.id);
      all.push(...channels.map((c) => ({ id: c.id, name: `${c.name} (${team.name})` })));
    }
    return all;
  }
  return [];
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
interface CommsChannelFetchState {
  status: "idle" | "loading" | "loaded" | "error";
  channels?: readonly AgentChannelRef[];
  error?: string;
}

export class ConnectElement extends ConnectBase {
  private overviewGrid!: GridView;
  private backBtn!: HTMLButtonElement;
  private sectionTitleEl!: HTMLElement;
  private subscreenView!: HTMLElement;
  private agentView!: HTMLElement;
  private agentForm!: HTMLElement;
  private agentBackBtn!: HTMLButtonElement;
  private readonly sectionEls = new Map<string, HTMLElement>();
  private currentSectionId: string | null = null;
  // Per-provider channel-fetch state, reset each time the Agent tile is
  // opened (renderAgentForm() rebuilds this too) - not persisted, since
  // the real channel list can change between visits and there is
  // nothing stale worth caching across a full re-render.
  private readonly commsChannelFetch = new Map<string, CommsChannelFetchState>();

  connectedCallback(): void {
    this.innerHTML = `
      <div id="connect-view" data-part="content">
        <view-grid id="connect-overview-grid"></view-grid>
        <div id="connect-subscreen-view" hidden>
          <div class="dash-subnav">
            <button id="connect-back-btn" class="dash-back-btn" type="button">← Connect</button>
            <h2 id="connect-section-title" class="workspace-stage-title"></h2>
          </div>
        </div>
        <div id="connect-agent-view" hidden>
          <div class="dash-subnav">
            <button id="connect-agent-back-btn" class="dash-back-btn" type="button">← Connect</button>
            <h2 class="workspace-stage-title">🤖 Agent</h2>
          </div>
          <p class="connect-hint agent-hint">Choose which connected Comms/Socials channels Chat's Agent mode is allowed to use. A channel only reaches the agent once it's both connected below <em>and</em> enabled here - enabling one you haven't connected yet does nothing until you connect it. Once enabled, the agent can list channels, read real messages, and send a message or post (Mastodon/Bluesky) - sending/posting always pauses for your explicit confirmation first, showing the real destination and text, never silent.</p>
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
    this.sectionTitleEl = this.querySelector<HTMLElement>("#connect-section-title")!;
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

    // A mounted section (so far: Socials' Dashboard) can hide this
    // outer "← Connect" while showing its own back button - real
    // on-device feedback: "← Connect" + "← Socials" + a Dashboard tab
    // row all stacked at once reads as 2 redundant back buttons, not 2
    // real navigation levels. Bubbles up from the section's own custom
    // element, so this only needs one listener here rather than a
    // reference threaded into every section - see socials.ts's
    // showDashboard()/showMain().
    this.addEventListener("connect-section-back-toggle", (e) => {
      this.backBtn.hidden = (e as CustomEvent<{ hideOuterBack: boolean }>).detail.hideOuterBack;
    });
  }

  // Rebuilt fresh every time the Agent tile is opened - connected status
  // can have changed since the last visit (e.g. the user just connected
  // Slack in the Comms subscreen) - a real re-render, not a stale cache.
  // Comms renders as a per-provider channel picker (real channels, not a
  // single "enable this whole provider" checkbox - see fetchCommsChannels'
  // own comment); Socials stays a flat per-provider checkbox, since
  // Mastodon/Bluesky have no "channel" concept to pick from.
  private renderAgentForm(): void {
    this.commsChannelFetch.clear();
    this.agentForm.innerHTML = `
      <p class="field-label">Comms</p>
      <div id="agent-comms-providers"></div>
      <p class="field-label">Socials</p>
      <div id="agent-socials-providers"></div>
    `;
    this.renderCommsProviders();
    this.renderSocialsProviders();
  }

  private renderCommsProviders(): void {
    const container = this.agentForm.querySelector<HTMLElement>("#agent-comms-providers")!;
    const access = getStoredAgentAccess();
    container.innerHTML = commsRows()
      .map((r) => {
        if (!r.connected) {
          return `<p class="field agent-comms-provider-row">${r.icon} ${r.name} — not connected</p>`;
        }
        const enabledCount = access.commsChannels[r.id]?.length ?? 0;
        return `
          <div class="agent-comms-provider-row">
            <button type="button" class="btn-secondary agent-manage-channels-btn" data-provider="${r.id}">
              ${r.icon} ${r.name} — manage channels${enabledCount > 0 ? ` (${enabledCount} enabled)` : ""} ▾
            </button>
            <div class="agent-channel-list" data-provider-list="${r.id}" hidden></div>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll<HTMLButtonElement>(".agent-manage-channels-btn").forEach((btn) => {
      btn.addEventListener("click", () => void this.toggleCommsChannelList(btn.dataset["provider"]!));
    });
  }

  private async toggleCommsChannelList(providerId: string): Promise<void> {
    const list = this.agentForm.querySelector<HTMLElement>(`[data-provider-list="${providerId}"]`)!;
    if (!list.hidden) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    const state = this.commsChannelFetch.get(providerId);
    if (state?.status === "loaded" || state?.status === "loading") {
      return;
    }
    this.commsChannelFetch.set(providerId, { status: "loading" });
    this.renderCommsChannelList(providerId);
    try {
      const channels = await fetchCommsChannels(providerId);
      this.commsChannelFetch.set(providerId, { status: "loaded", channels });
    } catch (e) {
      this.commsChannelFetch.set(providerId, { status: "error", error: e instanceof Error ? e.message : String(e) });
    }
    this.renderCommsChannelList(providerId);
  }

  private renderCommsChannelList(providerId: string): void {
    const list = this.agentForm.querySelector<HTMLElement>(`[data-provider-list="${providerId}"]`);
    if (!list) {
      return;
    }
    const state = this.commsChannelFetch.get(providerId);
    if (!state || state.status === "loading") {
      list.innerHTML = `<p class="connect-hint">Loading real channels…</p>`;
      return;
    }
    if (state.status === "error") {
      list.innerHTML = `<p class="connect-hint">⚠️ Couldn't load channels: ${state.error}</p>`;
      return;
    }
    const access = getStoredAgentAccess();
    const enabledIds = new Set((access.commsChannels[providerId] ?? []).map((c) => c.id));
    const channels = state.channels ?? [];
    if (channels.length === 0) {
      list.innerHTML = `<p class="connect-hint">No real channels found.</p>`;
      return;
    }
    list.innerHTML = channels
      .map(
        (c) => `
          <label class="field">
            <input type="checkbox" data-channel-id="${c.id}" ${enabledIds.has(c.id) ? "checked" : ""} />
            <span class="field-label">#${c.name}</span>
          </label>
        `
      )
      .join("");
    list.querySelectorAll<HTMLInputElement>("input[data-channel-id]").forEach((input) => {
      input.addEventListener("change", () => {
        const channelId = input.dataset["channelId"]!;
        const channel = channels.find((c) => c.id === channelId);
        if (!channel) {
          return;
        }
        const current = getStoredAgentAccess();
        const existing = current.commsChannels[providerId] ?? [];
        const nextChannels = input.checked ? [...existing, channel] : existing.filter((c) => c.id !== channelId);
        setStoredAgentAccess({ ...current, commsChannels: { ...current.commsChannels, [providerId]: nextChannels } });
        // Keep the manage-channels button's own "(N enabled)" count fresh -
        // renderCommsProviders() rebuilds the whole provider list
        // (wiping the channel list's DOM in the process, even though the
        // fetched channels are still cached in commsChannelFetch), so
        // the channel list itself must be explicitly re-shown afterward.
        this.renderCommsProviders();
        const list = this.agentForm.querySelector<HTMLElement>(`[data-provider-list="${providerId}"]`)!;
        list.hidden = false;
        this.renderCommsChannelList(providerId);
      });
    });
  }

  private renderSocialsProviders(): void {
    const container = this.agentForm.querySelector<HTMLElement>("#agent-socials-providers")!;
    const access = getStoredAgentAccess();
    container.innerHTML = socialRows()
      .map(
        (r) => `
          <label class="field">
            <input type="checkbox" data-social-provider="${r.id}" ${access.socialsProviderIds.includes(r.id) ? "checked" : ""} ${r.connected ? "" : "disabled"} />
            <span class="field-label">${r.icon} ${r.name}${r.connected ? "" : " — not connected"}</span>
          </label>
        `
      )
      .join("");

    container.querySelectorAll<HTMLInputElement>("input[data-social-provider]").forEach((input) => {
      input.addEventListener("change", () => {
        const id = input.dataset["socialProvider"]!;
        const current = getStoredAgentAccess();
        const nextIds = input.checked ? [...current.socialsProviderIds, id] : current.socialsProviderIds.filter((existing) => existing !== id);
        setStoredAgentAccess({ ...current, socialsProviderIds: nextIds });
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
    // Reset to visible - a previously-opened section's Dashboard may
    // have hidden it (see the connect-section-back-toggle listener
    // above), and that state must not leak into a freshly-opened
    // section.
    this.backBtn.hidden = false;
    // Socials-only for now (real feedback scoped this to Socials, not a
    // general redesign) - Comms/Cartoon keep rendering their own
    // <view-nav-header> below this row, unchanged, until/unless the
    // same request is made for them.
    this.sectionTitleEl.textContent = sectionId === "socials" ? `${section.icon} ${section.label}` : "";

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
