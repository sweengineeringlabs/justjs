import type { FeatureStore } from "@justjs/data";
import type { AppState, AppAction } from "../core/state.js";
import { HomeBase } from "../features/home/home_component.gen.js";
import "./sdlc_hub.js";
import type { SdlcHubElement } from "./sdlc_hub.js";

// A real Home, not a re-skinned Editor - the nav-bar's umbrella entry
// point and the first-time-visitor landing route (src/app.ts's
// landingRoute default). Now the SDLC workspace hub itself, and only
// that (direct user request: "Home should only contain SDLCs" - the
// former hero title/tagline and Develop/Connect launcher cards are
// gone; Chat and Connect stay reachable via their own bottom-nav tabs
// regardless of what Home's own body shows). The former Workspace tab's
// entire 9-stage grid + drill-down lives inline here, via a single
// mounted <control-sdlc-hub> (see sdlc_hub.ts). That control isn't
// router-mounted (it's a plain appended child, not a route of its own),
// so it never gets a dataContext push automatically from the framework
// - this class's own dataContext setter forwards `store` to it
// manually, both at creation time and on every later update.
export class HomeElement extends HomeBase {
  private store?: FeatureStore<AppState, AppAction>;
  private sdlcHub?: SdlcHubElement;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.store = ctx?.store;
    this.sdlcHub?.setStore(this.store);
  }

  connectedCallback(): void {
    this.innerHTML = `<div id="home-sdlc-mount" data-part="content"></div>`;
    // super.connectedCallback() runs _bindElements() (the "content" part
    // above), consistent with every other feature's ordering.
    super.connectedCallback();

    // dataContext (ADR-0004) can be set on a freshly-constructed element
    // before it's ever appended to the DOM (@justjs/application's own
    // render adapter assigns it ahead of container.replaceChildren()),
    // so this.store may already be populated by the time this method
    // runs - re-sync explicitly rather than assuming dataContext will
    // fire again after the hub exists.
    this.sdlcHub = document.createElement("control-sdlc-hub") as SdlcHubElement;
    this.sdlcHub.setStore(this.store);
    this.querySelector("#home-sdlc-mount")!.appendChild(this.sdlcHub);
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-home")) {
  customElements.define("x-home", HomeElement);
}
