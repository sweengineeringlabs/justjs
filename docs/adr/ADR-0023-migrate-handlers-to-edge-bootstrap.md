# ADR-0023: Retire justjs/ai-assist's client-side Anthropic key in favor of an edge-bootstrap-hosted Handler

- **Status:** Proposed — not yet accepted, the open questions below need
  resolution before implementation starts
- **Date:** 2026-08-20 (corrected twice, same day — see Correction history below)

## Scope note

This ADR decides one thing: the Anthropic-key retirement. It's Phase 1 of
a much larger goal tracked in
[justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155) —
retiring justjs's hand-rolled transport/AOP infrastructure entirely in
favor of edge-bootstrap Handlers, not just this one integration. Later
retirements (`@justjs/transport`, `aop/security`, `aop/observability`,
etc.) get their own ADRs when they're actually investigated, same
convention as this repo's ADR-0017/0019/0020/0021/0022 series — one
decision per ADR, not one ADR for the whole program.

## Correction history (kept for context, not deleted)

This ADR went through two prior, wrong framings before landing here.

**v1** assumed a pre-existing `Handler` abstraction inside `justjs` to
audit and port. Verified wrong against the real source: no such type
exists anywhere. `@justjs/application`'s real API (`Component`, `Router`,
`RuntimeAdapter`) is a client-side DOM component-mounting system, not a
server-side dispatcher.

**v2** proposed wrapping `@justjs/component-view`'s `BadgeView` in
`@justjs/ssr`'s `renderComponent()` (real, tested, shipped in `justjs#12`,
but zero callers anywhere today) as a Handler, compiled via `justc
--target wasm --component` and hosted through edge-bootstrap's
`WasmtimeComponentEngine`. `BadgeView` itself was correctly selected —
real Shadow DOM, zero data dependency, tested, genuinely used elsewhere.
**Verified wrong at the infrastructure level, live:**

```
$ justc build --target wasm --component --output handler.wasm handler.ts
error: unexpected argument '--component' found
```

Root cause, traced through both repos: `edge-bootstrap#59` relocated the
componentization logic (WIT world, `ComponentEncoder` wiring) *out of*
`justscript_compiler` and *into* edge-bootstrap's own `main/componentizer`
crate — confirmed by that crate's own doc comment and
`justscript_compiler`'s own superseded design doc. But
`edge-bootstrap-componentizer` is a pure library with zero consumers
anywhere in edge-bootstrap (checked every `Cargo.toml` in `main/*`) — the
CLI flag was never rewired to call it. Independently of that bug,
`justc build --target wasm`'s own design doc states the wasm target
"only supports the byte-oriented `Uint8Array` pass-through profile plus
plain numeric functions — general objects/arrays/strings/DOM compiled to
Wasm remain unsupported." No DOM-based component — `BadgeView` included
— can compile through `justc`'s wasm target today, independent of the
CLI bug.

A real, working alternative execution path was found and investigated
(`justscript_runtime`/`justr` — a Cranelift-JIT daemon with a real,
already-wired `HttpRequest`/`HttpResponse` FFI bridge, built on the same
`edge_ingress_http`/`edge_dispatcher` crate family edge-bootstrap uses),
but whether its FFI surface exposes real DOM primitives was never
confirmed, and the premise itself (SSR-rendering a UI component) turned
out not to be the actual goal — dropped in favor of v3 below, not because
`justr` was disproven.

## Current, real target (v3)

`ai-code-editor`'s Anthropic provider
(`ai-assist/scm/main/src/core/anthropic_provider.ts`) calls
`https://api.anthropic.com/v1/messages` directly from the browser, with
the API key (`AnthropicAiAssistConfig.apiKey`) held client-side and sent
as the `x-api-key` header — a real security/architecture gap, independent
of any broader migration: the key is exposed to anyone using the deployed
app.

The fix: a Handler, hosted by edge-bootstrap, that does the same job —
receives the chat/completion request, holds the API key server-side
(config/env, not the browser), calls Anthropic via edge-bootstrap's real
`HttpEgress`, returns the response. `ai-code-editor`'s frontend then calls
this Handler instead of calling Anthropic directly.

No Wasm, no `justc`, no `justr`, no `@justjs/ssr`, no DOM involved at all
— this is a plain Handler (request in, response out), and
`anthropic_provider.ts`'s own logic has no DOM dependency to begin with.
Everything from the v1/v2 investigation above (the broken `--component`
flag, the wasm target's DOM limitation, `justr`'s FFI surface) is
unrelated to this target and doesn't need resolving for it to proceed.

## What's verified, what isn't

**Real and proven:** edge-bootstrap's HTTP ingress (`.http_route()`) —
extensively live-verified.

**Real but not proven with a live external call:** edge-bootstrap's
`HttpEgress` composition (ADR-008) is real and built, but no test or
example found makes a live call to a real external API and gets a real
response back — existing coverage is hand-written test doubles. This is
the actual first thing to prove.

**Not a separate concern, corrected during this investigation:**
credential handling. There is no separate "credential resolver" surface
that needs proving — in edge-bootstrap's dataflow, everything happens
inside `Handler::execute()`; the API key is just a value the Handler
holds (loaded from config/env at startup). No independent infrastructure
layer is required — `CredentialResolver`/`SecretString` exist as
re-exported types but have zero real usage anywhere in edge-bootstrap;
they're optional conveniences, not a prerequisite.

## Approach

**Phase 1 (mechanism proof, no `justjs`/`ai-code-editor` changes):** prove
a real edge-bootstrap Handler can call a real external HTTP API via
`HttpEgress` and get a real response back. Then build the Anthropic-proxy
Handler itself and live-verify it against the real Anthropic API.

**Phase 2 (retirement):** point `ai-code-editor`'s Anthropic provider at
the new edge-bootstrap endpoint instead of calling Anthropic directly;
remove the client-side API key requirement; live-verify all of
`ai-code-editor`'s real AI-assist features (chat, completion, review,
scaffold) still work through the new path.

## Open questions (need resolution before implementation starts)

- How is the API key actually supplied to the edge-bootstrap Handler
  (env var via `RuntimeConfig`, a config file, something else)? Not yet
  decided.
- Does `ai-code-editor`'s frontend call the new Handler directly, or
  through some existing abstraction (`ApiAdapter`)? Not yet decided.
- Where does this Handler live — a new edge-bootstrap example/service, or
  folded into something existing? Not yet decided.

## Scope

### Deliberately not decided here

- Whether other `ai-code-editor` integrations (AWS/`cloud-connect`, the
  other "connect" packages) retire the same way — out of scope; this ADR
  only commits to the Anthropic piece.

### If pursued

- Proof that a real edge-bootstrap Handler can call a real external API
  via `HttpEgress`.
- The Anthropic-proxy Handler itself, live-verified.
- `ai-code-editor` updated to call it instead of Anthropic directly.

### Permanently out of scope (for this ADR)

- Everything from the v1/v2 investigation (Wasm component compilation,
  `@justjs/ssr`, `justr`) — unrelated to this target, not being pursued
  here.

## Acceptance criteria (for this ADR's own resolution, not implementation)

- [ ] Open questions above answered
- [ ] `justjs#155`'s Phase 1 tasks scoped/estimated

## Relates to

- [justjs#155](https://github.com/sweengineeringlabs/justjs/issues/155) — the tracking epic this ADR backs
- `ai-assist/scm/main/src/core/anthropic_provider.ts` — the client-side integration this retires
- [edge-bootstrap#62](https://github.com/sweengineeringlabs/edge-bootstrap/issues/62) — unrelated to this now; kept open as independent future work on the Wasm-component contract from the v2 investigation
