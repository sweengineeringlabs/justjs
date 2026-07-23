//! A transparent JSON relay - forwards a request body verbatim to a fixed
//! upstream URL and returns the upstream's response verbatim (status + body),
//! whatever it is. Never inspects, validates, or stores the payload - this
//! service exists solely to add CORS headers, not to implement any part of
//! OAuth itself.

use async_trait::async_trait;
use edge_domain::{Handler, HandlerContext, HandlerError};
use swe_edge_ingress_http::{HttpBody as IngressHttpBody, HttpRequest as IngressHttpRequest, HttpResponse as IngressHttpResponse};

use crate::api::RelayTarget;

// Plain reqwest, not swe-edge-egress-http - see Cargo.toml's comment on the
// reqwest dependency for why: DefaultHttpEgress::send() reinterprets several
// status codes as hard errors and discards the real response body, which
// breaks verbatim relaying (confirmed by a real, failing device-code request
// during manual testing, not assumed from documentation).
pub struct JsonRelayHandler {
    target: RelayTarget,
    client: reqwest::Client,
}

impl JsonRelayHandler {
    pub fn new(target: RelayTarget, client: reqwest::Client) -> Self {
        Self { target, client }
    }
}

#[async_trait]
impl Handler for JsonRelayHandler {
    type Request = IngressHttpRequest;
    type Response = IngressHttpResponse;

    fn id(&self) -> &str {
        self.target.id
    }

    fn pattern(&self) -> &str {
        self.target.pattern
    }

    async fn execute(
        &self,
        req: IngressHttpRequest,
        _ctx: HandlerContext<'_>,
    ) -> Result<IngressHttpResponse, HandlerError> {
        let body_value = extract_json_body(&req.body)?;

        let response = self
            .client
            .post(self.target.target_url)
            .header("Accept", "application/json")
            .json(&body_value)
            .send()
            .await
            .map_err(|e| HandlerError::ExecutionFailed(format!("relaying to {}: {e}", self.target.target_url)))?;

        // Relayed verbatim, whatever the status - GitHub's device-flow token
        // endpoint returns HTTP 200 even for a pending/failed poll
        // (authorization_pending/slow_down/expired_token/access_denied all
        // live in the JSON body's `error` field, never the status), and the
        // device-code request can legitimately 404 for a bad client_id. This
        // relay must never reinterpret any of that as a transport failure -
        // only a real connection/network error (the .send() above) is.
        let status = response.status().as_u16();
        // Real bug found via live testing: IngressHttpResponse::new() alone
        // leaves `headers` empty, which drops GitHub's real Content-Type.
        // Without it, @justjs/transport's ApiAdapter never recognizes the
        // body as JSON and returns it as an unparsed string - `expires_in`/
        // `interval` silently become `undefined`, which turned the poll
        // loop's deadline into `NaN` and made it exit before ever polling
        // once. The Content-Type must be forwarded, not just the bytes.
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/json")
            .to_string();
        let body = response
            .bytes()
            .await
            .map_err(|e| HandlerError::ExecutionFailed(format!("reading response from {}: {e}", self.target.target_url)))?;

        let mut resp = IngressHttpResponse::new(status, body.to_vec());
        resp.headers.insert("content-type".to_string(), content_type);
        Ok(resp)
    }
}

// The real browser client (scm-connect's github_device_flow.ts) always
// sends a JSON body - Form/Raw are accepted defensively so a malformed or
// differently-encoded client still gets a real 400 instead of a panic,
// never silently dropped. Pure and separate from `execute()` so it's
// directly unit-testable without a Handler/HandlerContext/network stack.
fn extract_json_body(body: &Option<IngressHttpBody>) -> Result<serde_json::Value, HandlerError> {
    match body {
        Some(IngressHttpBody::Json(v)) => Ok(v.clone()),
        Some(IngressHttpBody::Raw(bytes)) => serde_json::from_slice(bytes)
            .map_err(|e| HandlerError::InvalidRequest(format!("expected a JSON body: {e}"))),
        Some(IngressHttpBody::Form(map)) => serde_json::to_value(map)
            .map_err(|e| HandlerError::InvalidRequest(format!("could not read form body: {e}"))),
        _ => Err(HandlerError::InvalidRequest("expected a request body".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_extract_json_body_returns_the_value_for_a_json_body() {
        let body = Some(IngressHttpBody::Json(serde_json::json!({"client_id": "abc"})));
        let result = extract_json_body(&body).expect("ok");
        assert_eq!(result, serde_json::json!({"client_id": "abc"}));
    }

    #[test]
    fn test_extract_json_body_parses_a_raw_body_as_json() {
        let body = Some(IngressHttpBody::Raw(br#"{"scope":"repo"}"#.to_vec()));
        let result = extract_json_body(&body).expect("ok");
        assert_eq!(result, serde_json::json!({"scope": "repo"}));
    }

    #[test]
    fn test_extract_json_body_rejects_a_malformed_raw_body() {
        let body = Some(IngressHttpBody::Raw(b"not json".to_vec()));
        let err = extract_json_body(&body).unwrap_err();
        assert!(matches!(err, HandlerError::InvalidRequest(_)));
    }

    #[test]
    fn test_extract_json_body_converts_a_form_body_to_json() {
        let mut form = HashMap::new();
        form.insert("client_id".to_string(), "abc".to_string());
        let body = Some(IngressHttpBody::Form(form));
        let result = extract_json_body(&body).expect("ok");
        assert_eq!(result, serde_json::json!({"client_id": "abc"}));
    }

    #[test]
    fn test_extract_json_body_rejects_a_missing_body() {
        let err = extract_json_body(&None).unwrap_err();
        assert!(matches!(err, HandlerError::InvalidRequest(_)));
    }

    #[test]
    fn test_handler_id_and_pattern_come_from_the_configured_target() {
        let handler = JsonRelayHandler::new(
            RelayTarget { id: "test-id", pattern: "/test/pattern", target_url: "https://example.com" },
            reqwest::Client::new(),
        );
        assert_eq!(handler.id(), "test-id");
        assert_eq!(handler.pattern(), "/test/pattern");
    }
}
