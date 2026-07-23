//! scm-bo: minimal relay backend for GitHub OAuth Device Flow (justjs#135).
//!
//! GitHub's device-flow endpoints send no CORS headers, so ai-code-editor's
//! browser/WebView client cannot call them directly (confirmed by direct
//! testing against real, valid client IDs). This service is a transparent
//! passthrough that adds the CORS headers a browser needs - it never sees a
//! token, an OAuth App Client ID, or any account-specific data.

mod api;
mod core;
mod saf;
mod spi;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    saf::run().await
}
