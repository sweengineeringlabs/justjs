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
  readonly fields: readonly FormField[];
  // Host-computed initial connected state (e.g. "a token is already
  // stored"), the same "props in" pattern every component-view element
  // already uses. The control layers its own session-scoped tracking
  // on top once the user actually connects/disconnects.
  readonly connected?: boolean;
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
}
