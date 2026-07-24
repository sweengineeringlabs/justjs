// Pure catalog data, split out of components/communication.ts so
// agent_channels.ts/connect.ts can import it without depending on a
// file whose sole other job is registering the <x-communication>
// custom element. (The actual Connect -> Socials empty-list bug found
// on a real Android device turned out to be a justc bundler identifier
// collision - see core/socials_catalog.ts's isSocialProviderConnected
// comment for the real root cause - not this file's own extraction,
// but the same split is worth keeping here too for consistency.)
import { discordLogo } from "./brand_logos.js";

export interface CommsProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  // Real command the user runs locally to get a token - only Microsoft
  // Teams needs this (a short-lived CLI-issued token, matching Azure's
  // own pattern in workspace.ts's Cloud connect screens). Shown
  // verbatim in the connect form, along with the token's real expiry.
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  // "channels" - Slack's own connect() already returns real channels
  // directly; opening one goes straight to its real message thread.
  // "guildsOrTeams" - Discord's/Teams' own connect() returns the
  // top-level guild/team, one real level shallower than a channel -
  // opening one shows a real channel list first (listChannels()),
  // *then* a message thread.
  readonly kind: "channels" | "guildsOrTeams";
}

// A real, recognizable set of actual communication providers - not a
// free-text "type any name" list. All 3 use a single pasted bearer-
// shaped token (a real bot token or CLI-issued access token), same
// security posture as the Anthropic key.
export const COMMS_PROVIDER_CATALOG: readonly CommsProvider[] = [
  { id: "slack", name: "Slack", icon: "💬", color: "#4A154B", kind: "channels" },
  { id: "discord", name: "Discord", icon: "🎮", color: "#5865F2", logo: discordLogo, kind: "guildsOrTeams" },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "👥",
    color: "#6264A7",
    tokenHint: { command: "az account get-access-token --resource-type ms-graph --query accessToken -o tsv", expiry: "~60-90 minutes" },
    kind: "guildsOrTeams",
  },
];
