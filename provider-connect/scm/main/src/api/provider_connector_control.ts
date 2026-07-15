import type { FormField, ListItem } from "@justjs/component-view";

export interface ProviderCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly color: string;
  readonly logo?: string;
  // 1 or 2 entries, reusing @justjs/component-view's own FormField
  // shape - each provider decides its own field ids/types/placeholders
  // (e.g. Bluesky: identifier + appPassword; a bearer provider: a
  // single token field), the control never hard-codes a "kind" enum.
  // Empty for a provider with no connect form at all (see
  // unsupportedMessage below).
  readonly fields: readonly FormField[];
  // Host-computed initial connected state (e.g. "a token is already
  // stored"), the same "props in" pattern every component-view element
  // already uses. The control layers its own session-scoped tracking
  // on top once the user actually connects/disconnects.
  readonly connected?: boolean;
  // Shown above the form (e.g. "stored only on this device, sent
  // directly to X" plus any provider-specific caveat) - real copy
  // every existing screen already shows, not itself part of ADR-0015's
  // FormView scope (a view never owns arbitrary prose).
  readonly disclosure?: string;
  // A heading shown above the resource list once populated (e.g.
  // "Follows", "r/popular") - real per-provider copy, not part of
  // ADR-0016's ListView scope either.
  readonly resourceListLabel?: string;
  // When set, this provider has no connect form at all - checked
  // directly against Socials' real X/LinkedIn entries (no confirmed
  // CORS access from a browser): the control shows this message
  // instead of <view-form>/<view-status-line>/<view-list>, and never
  // calls connect()/list() for this provider. A real, necessary
  // extension beyond ADR-0007's original OAuth/billed-generate
  // exclusions, discovered by migrating a real consumer with a third
  // kind of unsupported case - disclosed here, not silently invented.
  readonly unsupportedMessage?: string;
}

// Caller-supplied network calls - the control never talks to a
// network itself, matching ADR-0007's scope: "the caller supplies the
// actual network calls (already implemented per-package in each
// *-connect SAF), the element owns which step it's on."
export type ConnectFunction = (providerId: string, values: Readonly<Record<string, string>>) => Promise<unknown>;
export type ListFunction = (providerId: string, session: unknown) => Promise<readonly ListItem[]>;
export type DisconnectFunction = (providerId: string) => void;

export interface ProviderConnectorControlProps {
  readonly providers?: readonly ProviderCatalogItem[];
  readonly connect?: ConnectFunction;
  readonly list?: ListFunction;
  readonly disconnect?: DisconnectFunction;
  // The detail screen's back-button label (composes <view-nav-header>
  // internally - e.g. "Socials" renders "← Socials"), matching every
  // existing screen's own "← <catalog name>" convention.
  readonly catalogLabel?: string;
}
