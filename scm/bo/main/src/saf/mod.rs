//! Composition root - builds the egress client, registers GitHub's device-
//! flow relay handlers, and serves them over a real bound HTTP port. This is
//! the only place this crate touches axum/tokio directly - everything else
//! only knows the edge Handler/HttpIngress/HttpEgress contracts.

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use edge_domain::{InProcessHandlerRegistry, SecurityContext};
use swe_edge_ingress_http::{
    HttpBody, HttpHandlerRegistryDispatcher, HttpIngress, HttpIngressError, HttpMethod,
    HttpRequest as IngressHttpRequest, HttpResponse as IngressHttpResponse,
};
use tower_http::cors::CorsLayer;

use crate::spi::git::register_git_handlers;

const DEFAULT_BIND: &str = "127.0.0.1:8787";

/// Builds and serves the relay until the process is killed. Binds to
/// `DEFAULT_BIND` (loopback-only) unless the `SCM_BO_BIND` env var overrides
/// it - loopback-only by default is deliberate (this is a dev-only relay,
/// per justjs#135's plan, not yet a hosted/hardened service), but a real
/// physical device (Android WebView, or a teammate's browser) on the same
/// LAN cannot reach `127.0.0.1` at all - it needs the host's real LAN
/// address, e.g. `SCM_BO_BIND=0.0.0.0:8787`, set explicitly, not silently
/// defaulted to, since binding to all interfaces is a real exposure change
/// worth being an opt-in.
pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let bind = std::env::var("SCM_BO_BIND").unwrap_or_else(|_| DEFAULT_BIND.to_string());
    // Plain reqwest client - see Cargo.toml/json_relay_handler.rs's comments
    // for why swe-edge-egress-http isn't used here: its concrete send()
    // reinterprets several real, expected GitHub statuses as hard errors and
    // discards the response body, breaking verbatim relaying.
    let client = reqwest::Client::new();

    let registry = Arc::new(InProcessHandlerRegistry::<IngressHttpRequest, IngressHttpResponse>::new());
    let dispatcher = Arc::new(HttpHandlerRegistryDispatcher::new(registry));
    register_git_handlers(&dispatcher, client)?;

    // CorsLayer::permissive() (any origin/method/header) is safe here - this
    // relay carries no cookies/credentials and no secret (device flow's
    // client_id is not secret; the resulting token never touches this
    // service's own storage, it's forwarded straight back to the browser).
    let app = Router::new()
        .route("/github/device/code", post(relay))
        .route("/github/device/token", post(relay))
        .layer(CorsLayer::permissive())
        .with_state(dispatcher);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    println!("scm-bo listening on http://{bind}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn relay(
    State(dispatcher): State<Arc<HttpHandlerRegistryDispatcher>>,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let mut ingress_headers = HashMap::new();
    for (name, value) in headers.iter() {
        if let Ok(v) = value.to_str() {
            ingress_headers.insert(name.as_str().to_string(), v.to_string());
        }
    }
    let ingress_req = IngressHttpRequest {
        method: HttpMethod::Post,
        url: uri.path().to_string(),
        headers: ingress_headers,
        query: HashMap::new(),
        body: Some(HttpBody::Raw(body.to_vec())),
        timeout: None,
    };

    match dispatcher.handle(ingress_req, SecurityContext::unauthenticated()).await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
            let mut builder = Response::builder().status(status);
            for (k, v) in &resp.headers {
                builder = builder.header(k, v);
            }
            builder
                .body(Body::from(resp.body))
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(err) => {
            let status = ingress_error_status(&err);
            (status, err.to_string()).into_response()
        }
    }
}

fn ingress_error_status(err: &HttpIngressError) -> StatusCode {
    match err {
        HttpIngressError::NotFound(_) => StatusCode::NOT_FOUND,
        HttpIngressError::InvalidInput(_) => StatusCode::BAD_REQUEST,
        HttpIngressError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
        HttpIngressError::PermissionDenied(_) => StatusCode::FORBIDDEN,
        HttpIngressError::Conflict(_) => StatusCode::CONFLICT,
        HttpIngressError::MethodNotAllowed(_) => StatusCode::METHOD_NOT_ALLOWED,
        HttpIngressError::UnprocessableEntity(_) => StatusCode::UNPROCESSABLE_ENTITY,
        HttpIngressError::Unavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
        HttpIngressError::Timeout(_) => StatusCode::REQUEST_TIMEOUT,
        HttpIngressError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ingress_error_status_maps_every_variant_to_a_distinct_real_status_code() {
        assert_eq!(ingress_error_status(&HttpIngressError::NotFound("x".into())), StatusCode::NOT_FOUND);
        assert_eq!(ingress_error_status(&HttpIngressError::InvalidInput("x".into())), StatusCode::BAD_REQUEST);
        assert_eq!(ingress_error_status(&HttpIngressError::Unauthorized("x".into())), StatusCode::UNAUTHORIZED);
        assert_eq!(ingress_error_status(&HttpIngressError::PermissionDenied("x".into())), StatusCode::FORBIDDEN);
        assert_eq!(ingress_error_status(&HttpIngressError::Conflict("x".into())), StatusCode::CONFLICT);
        assert_eq!(ingress_error_status(&HttpIngressError::MethodNotAllowed("x".into())), StatusCode::METHOD_NOT_ALLOWED);
        assert_eq!(ingress_error_status(&HttpIngressError::UnprocessableEntity("x".into())), StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(ingress_error_status(&HttpIngressError::Unavailable("x".into())), StatusCode::SERVICE_UNAVAILABLE);
        assert_eq!(ingress_error_status(&HttpIngressError::Timeout("x".into())), StatusCode::REQUEST_TIMEOUT);
        assert_eq!(ingress_error_status(&HttpIngressError::Internal("x".into())), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
