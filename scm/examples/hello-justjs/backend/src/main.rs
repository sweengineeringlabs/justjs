//! Hello justjs Backend — `justjs#155`'s first real integration.
//! `hello-justjs`'s own `fetchRandomUser()` call
//! (`../src/core/state.js`) originally called `jsonplaceholder.typicode.com`
//! directly from the browser -- a stand-in specifically because there was
//! no real backend. Now that edge-bootstrap IS the backend, it serves this
//! data itself instead of merely forwarding to the same placeholder API:
//! no `http-egress` capability, no `allowed_egress_hosts`, no outbound
//! network call at all. Pure payload-transform, the same shape as
//! edge-bootstrap's own `scm/examples/edge-ts/handler.ts`.
//!
//! Lives here (in `justjs`, not `edge-bootstrap`) because this is
//! `hello-justjs`'s own backend, colocated with the app it serves --
//! `edge-bootstrap` is a real, separate dependency (pinned by tag in
//! `Cargo.toml`, the same way every other cross-repo dependency in this
//! ecosystem is), not something this example lives inside of.
//!
//! Run:
//!     cargo run -p hello-justjs-backend
//!
//! Then, from another terminal:
//!     curl -X POST http://127.0.0.1:18895/hello-justjs/user
//!     {"id":1,"name":"Edge Bootstrap Backend","email":"hello@edge-bootstrap.dev",...}
//!
//! `HANDLER_COMPONENT_BYTES` is real `justc build --target wasm
//! --component` output, compiled from `wasm/hello_justjs_backend_handler.ts`
//! — see that file's own doc comment for the exact invocation.

use edge_bootstrap_composer::{
    default_shutdown_signal, Builder, Manager, ManagerShutdownRequest, ManagerStartRequest,
    Runtime, RuntimeConfig,
};
use edge_bootstrap_wasm::{ArtifactProvenance, ComponentManifest, ResourceLimits};

const HTTP_BIND: &str = "127.0.0.1:18895";
const ROUTE_ID: &str = "/hello-justjs/user";

/// Real `justc build --target wasm --component` output — see
/// `../wasm/hello_justjs_backend_handler.ts`.
const HANDLER_COMPONENT_BYTES: &[u8] =
    include_bytes!("../wasm/hello_justjs_backend_handler.wasm");

#[tokio::main]
async fn main() {
    let component_bytes = HANDLER_COMPONENT_BYTES.to_vec();

    let manifest = ComponentManifest {
        component_id: "hello-justjs-backend".to_string(),
        route_id: ROUTE_ID.to_string(),
        contract_version: "swe:edge-handler@0.2.0".to_string(),
        handler_export: "fetch".to_string(),
        resource_limits: ResourceLimits {
            max_memory_bytes: 16 * 1024 * 1024,
            invoke_timeout_ms: 5_000,
            max_concurrency: 8,
            max_payload_bytes: 256 * 1024,
        },
        // No capabilities -- this handler makes no outbound call at all.
        capabilities: vec![],
        artifact_provenance: ArtifactProvenance {
            source: "real justc build --target wasm --component output, compiled from \
                      wasm/hello_justjs_backend_handler.ts -- see that file's own doc comment"
                .to_string(),
            checksum_sha256: "0".repeat(64),
            built_at: "2026-08-27T00:00:00Z".to_string(),
        },
        result_shape: None,
    };

    let config = RuntimeConfig::default()
        .with_service_name("hello-justjs-backend")
        .with_http_bind(HTTP_BIND);

    println!("http: http://{HTTP_BIND}{ROUTE_ID}");
    println!("serves real edge-bootstrap-owned data directly, no outbound network call");

    // `.wasm_route(manifest, component_bytes)` validates and loads the
    // component, then registers it through the same `.http_route_with()`
    // path a native Rust handler uses -- the documented, real working
    // shape for a justc-compiled TS handler (see edge-bootstrap's
    // docs/4-development/typescript_onboarding.md's "The real, working
    // shape today" section). No hand-rolled Handler, no manual
    // ComponentEngine::invoke() -- that would just reimplement what this
    // one call already does.
    let built = match Runtime::builder()
        .config(config)
        .wasm_route(manifest, component_bytes)
        .build()
    {
        Ok(b) => b,
        Err(e) => panic!("build failed: {e}"),
    };
    if let Err(e) = built.start(ManagerStartRequest).await {
        panic!("start failed: {e}");
    }
    default_shutdown_signal().await;
    if let Err(e) = built.shutdown(ManagerShutdownRequest).await {
        panic!("serve failed: {e}");
    }
}
