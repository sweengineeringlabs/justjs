//! GitHub Device Flow relay targets - the only real business logic this
//! service has is two fixed upstream URLs. It never sees a token, an OAuth
//! App Client ID, or any account-specific data; it only forwards bytes.

use std::sync::Arc;

use swe_edge_ingress_http::{
    HttpHandlerAdapter, HttpHandlerRegistryDispatcher, HttpIngressError, HttpRequest, HttpResponse,
};

use crate::api::RelayTarget;
use crate::core::JsonRelayHandler;

const DEVICE_CODE_TARGET: RelayTarget = RelayTarget {
    id: "github-device-code",
    pattern: "/github/device/code",
    target_url: "https://github.com/login/device/code",
};

const DEVICE_TOKEN_TARGET: RelayTarget = RelayTarget {
    id: "github-device-token",
    pattern: "/github/device/token",
    target_url: "https://github.com/login/oauth/access_token",
};

// Identity decode/encode - JsonRelayHandler's Request/Response are already
// HttpRequest/HttpResponse (it operates directly at the HTTP level, not a
// typed domain object), so the adapter's only job here is satisfying
// HttpHandlerRegistryDispatcher::register()'s signature, same pattern this
// crate's own tests use for a handler that's already HTTP-shaped.
fn identity_decode(req: &HttpRequest) -> Result<HttpRequest, HttpIngressError> {
    Ok(req.clone())
}

fn identity_encode(resp: HttpResponse) -> HttpResponse {
    resp
}

/// Registers both GitHub device-flow relay handlers into `dispatcher`,
/// sharing one reqwest client (cheap to clone - internally Arc'd - no
/// per-target state to keep separate).
pub fn register_git_handlers(
    dispatcher: &HttpHandlerRegistryDispatcher,
    client: reqwest::Client,
) -> Result<(), swe_edge_ingress_http::HttpDispatcherError> {
    dispatcher.register(HttpHandlerAdapter::new(
        Arc::new(JsonRelayHandler::new(DEVICE_CODE_TARGET, client.clone())),
        identity_decode,
        identity_encode,
    ))?;
    dispatcher.register(HttpHandlerAdapter::new(
        Arc::new(JsonRelayHandler::new(DEVICE_TOKEN_TARGET, client)),
        identity_decode,
        identity_encode,
    ))?;
    Ok(())
}
