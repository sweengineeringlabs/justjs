import type { CredentialStore } from "../api/credential_store.js";
import { DefaultCredentialStore } from "../core/credential_store.js";

export type { CredentialStore } from "../api/credential_store.js";

export function createCredentialStore(namespace: string): CredentialStore {
  return new DefaultCredentialStore(namespace);
}

export type {
  ProviderCatalogItem,
  ConnectFunction,
  ListFunction,
  DisconnectFunction,
  OAuthBeginFunction,
  ProviderConnectorControlProps,
} from "../api/provider_connector_control.js";

// Type-only export, same core_not_exported_directly pattern
// @justjs/component-view's own saf/index.ts already established - a
// caller reaches the concrete class only via the tag name / DOM API
// (document.createElement("control-provider-connector")), never a
// class import.
export type { ProviderConnectorControl } from "../core/provider_connector_control.js";

// customElements.define("control-provider-connector", ...) is a real
// module-load side effect inside core/provider_connector_control.ts -
// importing it here is what self-registers the tag when a host does
// `import "@justjs/provider-connect"`.
import "../core/provider_connector_control.js";
