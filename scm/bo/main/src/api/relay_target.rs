//! Contract for a single JSON relay target.

/// Describes one relay endpoint: the local route it answers on and the real
/// upstream URL a request's JSON body is forwarded to, unchanged. This
/// service never inspects the body's contents - it only exists to add CORS
/// headers a browser is allowed to read, since GitHub's OAuth Device Flow
/// endpoints send none (confirmed by direct testing: a real, valid client_id
/// still gets zero `Access-Control-Allow-Origin` on a successful response).
#[derive(Debug, Clone, Copy)]
pub struct RelayTarget {
    /// Stable identifier, used as the handler registry key.
    pub id: &'static str,
    /// Local route path this target answers on (e.g. `/github/device/code`).
    pub pattern: &'static str,
    /// Real upstream URL the request body is forwarded to verbatim.
    pub target_url: &'static str,
}
