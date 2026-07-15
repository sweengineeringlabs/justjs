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
  // When set, the form's Connect button calls `oauthBegin` (a
  // synchronous, real-browser-navigation action) instead of `connect` -
  // a real, necessary extension beyond ADR-0007's original OAuth
  // exclusion, discovered migrating Jira (justjs#125): the form still
  // collects real fields (Jira's own OAuth app Client ID/Secret), but
  // "submitting" them navigates the browser to the provider's consent
  // screen rather than resolving in place, so connect()/list()'s normal
  // async session flow doesn't fit. When a provider is already
  // connected (a session persisted from a previous visit) and its
  // resources haven't been fetched yet this visit, the control calls
  // `list(providerId, undefined)` directly instead of `connect` first -
  // matching every oauthRedirect provider's own real shape: the caller
  // re-verifies the persisted session itself, there's nothing for
  // `connect` to legitimately return as a "session" mid-visit.
  readonly oauthRedirect?: boolean;
}

// Caller-supplied network calls - the control never talks to a
// network itself, matching ADR-0007's scope: "the caller supplies the
// actual network calls (already implemented per-package in each
// *-connect SAF), the element owns which step it's on."
export type ConnectFunction = (providerId: string, values: Readonly<Record<string, string>>) => Promise<unknown>;
export type ListFunction = (providerId: string, session: unknown) => Promise<readonly ListItem[]>;
export type DisconnectFunction = (providerId: string) => void;
// Real, synchronous browser navigation (e.g. beginJiraConnect's
// `location.assign(...)`) - never awaited, never expected to "resolve"
// in any meaningful sense, since the page unloads. Throwing (e.g. "Enter
// both the Client ID and Client Secret first.") is the real validation
// path - caught the same way ConnectFunction's own rejection is, shown
// via the same status line.
export type OAuthBeginFunction = (providerId: string, values: Readonly<Record<string, string>>) => void;

export interface ProviderConnectorControlProps {
  readonly providers?: readonly ProviderCatalogItem[];
  readonly connect?: ConnectFunction;
  readonly list?: ListFunction;
  readonly disconnect?: DisconnectFunction;
  readonly oauthBegin?: OAuthBeginFunction;
  // The detail screen's back-button label (composes <view-nav-header>
  // internally - e.g. "Socials" renders "← Socials"), matching every
  // existing screen's own "← <catalog name>" convention.
  readonly catalogLabel?: string;
}
