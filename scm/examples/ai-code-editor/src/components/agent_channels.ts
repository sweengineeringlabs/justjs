// Cross-references the real provider catalogs (core/comms_catalog.ts,
// core/socials_catalog.ts) against both the user's real connect tokens
// (comms_credentials.ts/socials_credentials.ts) and their separate
// agent-access opt-in (core/agent_access.ts) - a channel only ever
// reaches the agent if it's genuinely both connected AND explicitly
// enabled in Connect's Agent subscreen (see connect.ts), never one
// without the other. Imports the catalogs directly from core/ (pure
// data, no customElements.define side effects) rather than via
// communication.ts/socials.ts.
import { COMMS_PROVIDER_CATALOG } from "../core/comms_catalog.js";
import { getStoredCommsToken } from "../core/comms_credentials.js";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderConnected } from "../core/socials_catalog.js";
import { getStoredAgentAccess } from "../core/agent_access.js";
import type { AgentChannel } from "../core/agent_access.js";

export function getEnabledAgentChannels(): readonly AgentChannel[] {
  const access = getStoredAgentAccess();
  const comms: AgentChannel[] = COMMS_PROVIDER_CATALOG
    // Re-checks connected here too, not just at enable-time - if the
    // user disconnects a provider after enabling specific channels, its
    // recorded channels must stop reaching the agent immediately, not
    // just the next time they're re-picked in the UI.
    .filter((p) => getStoredCommsToken(p.id).length > 0)
    .flatMap((p) => (access.commsChannels[p.id] ?? []).map((ch) => ({ kind: "comms" as const, providerId: p.id, channelId: ch.id, channelName: ch.name })));
  const socials: AgentChannel[] = SOCIAL_PROVIDER_CATALOG.filter(
    (p) => access.socialsProviderIds.includes(p.id) && isSocialProviderConnected(p)
  ).map((p) => ({ kind: "socials" as const, providerId: p.id, providerName: p.name }));
  return [...comms, ...socials];
}
