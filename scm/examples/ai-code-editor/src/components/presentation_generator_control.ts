import { splitMarkdownSlides } from "../core/markdown.js";
import { DocGeneratorControl } from "./doc_generator_control.js";

// Real Shadow DOM extraction of x-workspace's Presentation generator
// (justjs#123, part of justjs#119's decomposition) - the same
// Markdown+Mermaid "describe -> generate -> edit/preview -> create
// file" flow DocGeneratorControl (Design's real shape) already covers,
// plus slide splitting and Prev/Next nav. Confirmed near-total
// structural duplication with Design before extracting (same CSS
// classes even) - a real, justified shared base, not a speculative one.
export class PresentationGeneratorControl extends DocGeneratorControl {
  #slideChunks: string[] = [];
  #currentSlideIndex = 0;

  constructor() {
    super({
      icon: "📽️",
      heading: "Generate",
      backLabel: "Presentation",
      descriptionLabel: "Describe the presentation",
      descriptionPlaceholder: "e.g. pitch this app to a new team",
      defaultFilePath: "slides.md",
    });
  }

  protected override onDocChanged(): void {
    // Re-split from the current doc first - an edit (or a fresh
    // generate) may have changed the slide count entirely, so the
    // previous currentSlideIndex can't be trusted to still point at
    // the same logical slide. Nav UI updates synchronously here (not
    // just in afterPreviewRendered) so the indicator/Prev/Next reflect
    // the real slide count immediately, without waiting for the async
    // Mermaid render to finish - matches the original's own
    // updateSlidesNavUI() placement before its await.
    this.#slideChunks = splitMarkdownSlides(this.doc ?? "");
    this.#currentSlideIndex = 0;
    this.updateNavUI();
  }

  protected override currentPreviewSource(): string {
    return this.#slideChunks[this.#currentSlideIndex] ?? "";
  }

  protected override extraPreviewClass(): string {
    return "slides-preview";
  }

  protected override extraPreviewMarkup(): string {
    return `
      <div class="slides-nav">
        <button id="prev-btn" type="button">◀ Prev</button>
        <span id="indicator" class="slides-indicator"></span>
        <button id="next-btn" type="button">Next ▶</button>
      </div>
    `;
  }

  protected override bindExtraPreviewControls(): void {
    this.root.querySelector("#prev-btn")?.addEventListener("click", () => this.goToSlide(-1));
    this.root.querySelector("#next-btn")?.addEventListener("click", () => this.goToSlide(1));
    this.updateNavUI();
  }

  private goToSlide(delta: number): void {
    const nextIndex = this.#currentSlideIndex + delta;
    if (nextIndex < 0 || nextIndex >= this.#slideChunks.length) {
      return;
    }
    this.#currentSlideIndex = nextIndex;
    this.updateNavUI();
    void this.renderPreview();
  }

  private updateNavUI(): void {
    const indicator = this.root.querySelector<HTMLElement>("#indicator");
    const prevBtn = this.root.querySelector<HTMLButtonElement>("#prev-btn");
    const nextBtn = this.root.querySelector<HTMLButtonElement>("#next-btn");
    const total = this.#slideChunks.length;
    if (indicator) {
      indicator.textContent = total > 0 ? `Slide ${this.#currentSlideIndex + 1} of ${total}` : "";
    }
    if (prevBtn) {
      prevBtn.disabled = this.#currentSlideIndex <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = this.#currentSlideIndex >= total - 1;
    }
  }

  protected override afterPreviewRendered(): void {
    this.updateNavUI();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-presentation-generator")) {
  customElements.define("control-presentation-generator", PresentationGeneratorControl);
}
