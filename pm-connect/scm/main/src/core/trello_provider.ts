import type { ApiAdapter } from "@justjs/transport";
import type { PmConnectProvider, PmResource, TrelloCredentialsConfig } from "../api/provider.js";
import { PmConnectProviderError } from "../api/provider.js";

interface TrelloBoard {
  readonly id: string;
  readonly name: string;
  readonly closed: boolean;
}

// Trello - real distinct logic, not a shared bearer-GET engine: Trello's
// real auth convention is 2 query-string parameters (`key`+`token`),
// never a header (confirmed via Trello's own docs) - a real, deliberate
// deviation from every other bearer-token provider in this codebase,
// not an oversight. Trello's own docs also confirm 401 responses are
// real plain-text bodies ("invalid token"/"invalid key"), not JSON -
// connect() surfaces that raw text directly rather than assuming a JSON
// error shape every other provider can rely on.
export class TrelloPmConnectProvider implements PmConnectProvider {
  readonly concern = "pmConnect" as const;
  readonly strategy = "trello";

  constructor(
    private readonly config: TrelloCredentialsConfig,
    private readonly apiAdapter: ApiAdapter
  ) {}

  async connect(): Promise<PmResource[]> {
    const url = `https://api.trello.com/1/members/me/boards?key=${encodeURIComponent(this.config.apiKey)}&token=${encodeURIComponent(this.config.token)}&fields=id,name,closed`;
    let response;
    try {
      response = await this.apiAdapter.get<TrelloBoard[] | string>(url);
    } catch {
      throw new PmConnectProviderError(
        "NETWORK_ERROR",
        "Trello: network request failed - check your connection (no backend proxy, this calls api.trello.com directly)."
      );
    }
    if (response.error !== undefined) {
      if (response.status === 401) {
        const reason = typeof response.data === "string" && response.data ? response.data : "invalid key or token";
        throw new PmConnectProviderError("TOKEN_REJECTED", `Trello: credentials rejected (${reason}) - check both the API key and token.`);
      }
      throw new PmConnectProviderError("REQUEST_FAILED", `Trello: request failed (${response.status} ${response.error}).`);
    }
    return (response.data as TrelloBoard[]).map((b) => ({ id: b.id, name: b.name, status: b.closed ? "closed" : "open" }));
  }

  weave(): void {
    // Real no-op - see api/provider.ts's PmConnectProvider.weave() comment.
  }
}
