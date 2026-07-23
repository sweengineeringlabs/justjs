//! Extension points - one module per relay domain. `jira` stays unbuilt
//! until Jira's OAuth token endpoint's CORS behavior is actually confirmed
//! to need the same treatment (unverified as of justjs#135 - a quick check
//! showed a `Vary: Origin` header, unlike GitHub's completely CORS-silent
//! response, suggesting it may behave differently for a real registered
//! app). Don't build it speculatively.

pub mod git;
