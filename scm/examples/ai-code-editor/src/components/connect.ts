import "@justjs/component-view";
import type { GridView } from "@justjs/component-view";
import { ConnectBase } from "../features/connect/connect_component.gen.js";
import "./communication.js";
import "./socials.js";
import "./cartoon.js";

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
      </div>
    `;
    // Binds this.content via the real data-part lookup - must run after
    // the markup above exists, since ConnectBase's own connectedCallback()
    // calls _bindElements() synchronously.
    super.connectedCallback();

    this.overviewGrid = this.querySelector<GridView>("#connect-overview-grid")!;
    this.backBtn = this.querySelector<HTMLButtonElement>("#connect-back-btn")!;
    this.subscreenView = this.querySelector<HTMLElement>("#connect-subscreen-view")!;

    this.overviewGrid.items = SECTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon }));
    this.overviewGrid.addEventListener("item-select", (e) => {
      this.showSection((e as CustomEvent<{ id: string }>).detail.id);
    });
    this.backBtn.addEventListener("click", () => this.showOverview());
  }

  private showSection(sectionId: string): void {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) {
      return;
    }
    this.currentSectionId = sectionId;
    this.overviewGrid.hidden = true;
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
    this.overviewGrid.hidden = false;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-connect")) {
  customElements.define("x-connect", ConnectElement);
}
