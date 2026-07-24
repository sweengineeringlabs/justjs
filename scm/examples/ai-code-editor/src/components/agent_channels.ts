// Cross-references Communication's/Socials' own provider catalogs against
// both the user's real connect tokens (comms_credentials.ts/
// socials_credentials.ts) and their separate agent-access opt-in (core/
// agent_access.ts) - a channel only ever reaches the agent if it's
// genuinely both connected AND explicitly enabled in Connect's Agent
// subscreen (see connect.ts), never one without the other. Lives in the
// component layer (not core/) because it needs both provider catalogs,
// which are themselves component-layer data - agent_loop.ts only ever
// sees the resulting plain AgentChannel[], never the catalogs.
import { COMMS_PROVIDER_CATALOG } from "./communication.js";
import { getStoredCommsToken } from "../core/comms_credentials.js";
import { SOCIAL_PROVIDER_CATALOG, isProviderConnected as isSocialProviderConnected } from "./socials.js";
import { getStoredAgentAccess } from "../core/agent_access.js";
import type { AgentChannel } from "../core/agent_access.js";

export function getEnabledAgentChannels(): readonly AgentChannel[] {
  const access = getStoredAgentAccess();
  const comms: AgentChannel[] = COMMS_PROVIDER_CATALOG.filter(
    (p) => access.commsProviderIds.includes(p.id) && getStoredCommsToken(p.id).length > 0
  ).map((p) => ({ kind: "comms", id: p.id, name: p.name }));
  const socials: AgentChannel[] = SOCIAL_PROVIDER_CATALOG.filter(
    (p) => access.socialsProviderIds.includes(p.id) && isSocialProviderConnected(p)
  ).map((p) => ({ kind: "socials", id: p.id, name: p.name }));
  return [...comms, ...socials];
}
