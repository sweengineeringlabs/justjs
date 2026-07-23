import { navigateTo } from "../core/navigation.js";
import { HomeBase } from "../features/home/home_component.gen.js";

interface QuickAccessCard {
  readonly route: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
}

// Same 3 groups the nav bar clusters into (justjs#132/#96 feature-
// grouping pass) - Home is the umbrella entry point into all three, not
// a 4th sibling of equal weight, so it links to the first route in each
// group rather than duplicating every one of the 8 tabs here. Develop
// now routes to /chat, not /editor - Editor/Review/Scaffold moved under
// Workspace -> Development (direct user request), leaving Chat as the
// one standalone tool this card actually represents.
const CARDS: readonly QuickAccessCard[] = [
  {
    route: "/chat",
    title: "Develop",
    description: "Ask, debug, and iterate with your AI pair programmer",
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h14a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"/></svg>`,
  },
  {
    route: "/workspace",
    title: "Workspace",
    description: "Work on the go",
    // Distinct hub-and-spoke mark (not the generic 4-square grid glyph
    // every other card/nav icon in this file uses) - matches this app's
    // own description of Workspace as "an SDLC workspace hub linking
    // each stage to whichever ... tab actually serves it" (see app.ts's
    // top-of-file comment).
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="2.2"/><circle cx="10" cy="3" r="1.6"/><circle cx="17" cy="10" r="1.6"/><circle cx="10" cy="17" r="1.6"/><circle cx="3" cy="10" r="1.6"/><path d="M10 5.2V7.8M12.2 10H14.8M10 12.2V14.8M5.2 10H7.8"/></svg>`,
  },
  {
    route: "/communication",
    title: "Connect",
    description: "Stay connected, everywhere",
    icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><line x1="2.5" y1="10" x2="17.5" y2="10"/><path d="M10 2.5c2.2 2 3.4 4.7 3.4 7.5s-1.2 5.5-3.4 7.5c-2.2-2-3.4-4.7-3.4-7.5S7.8 4.5 10 2.5Z"/></svg>`,
  },
];

// justjs#132: a real Home, not a re-skinned Editor - the nav-bar's
// umbrella entry point and the new first-time-visitor landing route
// (src/app.ts's landingRoute default). Content is intentionally static
// (no fetched data, no per-visit state) - .home-hero's animated
// gradient mesh and .home-card's staggered entrance are pure CSS
// (app.css), so there is nothing here to keep in sync with app state.
export class HomeElement extends HomeBase {
  connectedCallback(): void {
    this.innerHTML = `
      <div class="home-hero" data-part="content">
        <div class="home-hero-mesh" aria-hidden="true"></div>
        <h2 class="home-hero-title">AI Code Editor</h2>
        <p class="home-hero-tagline">Code smarter. Ship faster.</p>
      </div>
      <div class="home-cards">
        ${CARDS.map(
          (card, i) => `
          <button class="home-card" type="button" data-route="${card.route}" style="--card-delay: ${i * 80}ms">
            <span class="home-card-icon">${card.icon}</span>
            <span class="home-card-body">
              <span class="home-card-title">${card.title}</span>
              <span class="home-card-description">${card.description}</span>
            </span>
          </button>`,
        ).join("")}
      </div>
    `;
    // super.connectedCallback() runs _bindElements() (the "content" part
    // above), consistent with every other feature's ordering.
    super.connectedCallback();

    this.querySelectorAll<HTMLButtonElement>(".home-card").forEach((card) => {
      card.addEventListener("click", () => navigateTo(card.dataset.route!));
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-home")) {
  customElements.define("x-home", HomeElement);
}
