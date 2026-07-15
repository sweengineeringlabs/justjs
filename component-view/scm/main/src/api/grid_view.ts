export interface GridItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly badgeColor?: string;
  readonly badgeLogo?: string;
  // Not in ADR-0014's originally-listed item shape - added after
  // checking app.css directly: WorkspaceElement's SDLC hub tiles each
  // carry their own hue (--stage-color, set today via a light-DOM
  // [data-stage="..."] selector). Shadow DOM rule matching can't reach
  // that from the host page, so the per-tile color has to travel as
  // real data instead - applied as an inline --stage-color custom
  // property, the same variable app.css's own .widget/.widget-icon
  // rules already key off (falling back to --accent when absent, e.g.
  // the plain provider-grid case).
  readonly accentColor?: string;
  readonly status?: string;
  readonly selected?: boolean;
}

export interface GridViewProps {
  readonly items?: readonly GridItem[];
}
