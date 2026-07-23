# scm-bo

A minimal Rust relay that unblocks justjs#135 (GitHub OAuth Device Flow
login for `@justjs/scm-connect`).

## Why this exists

GitHub's device-flow endpoints (`github.com/login/device/code`,
`github.com/login/oauth/access_token`) send no CORS headers, even on a
real, valid, successful response — confirmed live with two real
registered client IDs. A browser (or an Android WebView, not exempt from
CORS either) can never read those responses directly. This relay is a
dumb, transparent passthrough that adds the CORS headers GitHub's own
endpoints don't send. It never sees or stores a token — every real
repository call from the app still goes straight from the browser/device
to GitHub, unproxied.

## Endpoints

- `POST /github/device/code` → relays to `https://github.com/login/device/code`
- `POST /github/device/token` → relays to `https://github.com/login/oauth/access_token`

Both forward the request body and GitHub's response body verbatim
(status code, JSON body, and `Content-Type` included), with a permissive
CORS layer added.

## Running

```bash
cargo run
```

Binds to `127.0.0.1:8787` by default (loopback-only, deliberate — this is
a dev-only relay, not yet a hosted/hardened service). To test from a
physical device (Android WebView, or a teammate's browser) on the same
LAN, that address is unreachable — override the bind with:

```bash
SCM_BO_BIND=0.0.0.0:8787 cargo run
```

This is an explicit opt-in, not a default, since binding to all
interfaces is a real exposure change.

## Scope

GitHub only, for now. `src/spi/jira/` is deliberately unbuilt — Jira's
OAuth token endpoint's CORS behavior is unverified; don't build a Jira
relay speculatively.

Local dev only. Real hosting/production deployment is an explicit
follow-up decision, not solved here.
