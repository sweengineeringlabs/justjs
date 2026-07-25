# ADR-0018: AWS Bedrock as a second `aiAssist` strategy

- **Status:** Accepted — pilot implemented (`complete()`/`chat()`), open
  questions below resolved
- **Date:** 2026-07-25

## Summary

`@justjs/ai-assist`'s `AiAssistProvider` concern has exactly one strategy
today (`"anthropic"`, direct calls to Anthropic's own Messages API). This
proposes a second strategy, `"bedrock"`, calling AWS Bedrock's runtime
`InvokeModel` API directly from the browser (no backend, same posture
every other provider in this repo already has) — real SigV4-signed
requests, same as `@justjs/cloud-connect`'s AWS providers.

## Why this is viable (verified, not assumed)

The single biggest risk — whether Bedrock's runtime endpoint supports CORS
for direct browser calls at all — was checked live, the same way
CloudWatch's own CORS support was verified during the cloud-provisioning
work (ADR-0017):

1. An unsigned `POST` to `bedrock-runtime.us-east-1.amazonaws.com/model/.../invoke`
   from a real headless Chromium session returned a real, readable
   `403: "Authorization header is missing"` — not a CORS-blocked opaque
   response or a `TypeError: Failed to fetch`.
2. A fully SigV4-signed request (service `bedrock`, using
   `@justjs/cloud-connect`'s existing `signAwsRequest()`) with
   intentionally-invalid test credentials returned
   `403: "The security token included in the request is invalid."` — the
   same "request shape correct, credentials rejected" signature already
   seen live against STS and CloudWatch. This confirms both real CORS
   support and a correctly-formed signed request.

So the browser-only, no-backend architecture this whole repo is built on
does not need to change for this to work.

## What's real, new work — not a thin wrapper

- **Shared SigV4 signing.** `aws_sigv4.ts` today lives in
  `@justjs/cloud-connect`, a package about connecting to cloud resource
  providers — conceptually the wrong home for a generic AWS request-
  signing utility a completely different domain package (`ai-assist`)
  would also need. See [Open question 1](#open-questions-need-resolution-before-implementation-starts).
- **Request/response translation.** Bedrock wraps Claude with its own
  invoke envelope: SigV4 auth instead of `x-api-key`, a path-based model
  ID (`anthropic.claude-3-5-sonnet-20241022-v2:0`, URL-encoded) instead of
  a `model` field in the body, and its own response shape. All 8
  `AiAssistProvider` methods (`complete`/`chat`/`review`/`scaffold`/
  `scaffoldProject`/`generateDesignDoc`/`generateSlides`/`agentStep`) call
  through `AnthropicAiAssistProvider`'s private `send()`/`postToAnthropic()` —
  a Bedrock strategy needs its own equivalent translation, reusing the
  same prompt-construction logic (the prompts themselves don't need to
  change) but with a real, different transport/auth/response-parsing
  layer underneath.
- **Config shape.** `AiAssistProviderConfig` today is `{apiKey,
  completeModel?, capableModel?}` — Bedrock needs `{accessKeyId,
  secretAccessKey, region}` instead, matching
  `@justjs/cloud-connect`'s own `AwsCredentialsConfig` shape. Whether
  `AiAssistProviderConfig` becomes a union (mirroring
  `CloudConnectProviderConfig`'s own `BearerTokenConfig |
  AwsCredentialsConfig` union) or something else is part of the same
  open question about where shared AWS types should live.

## Resolved decisions

1. **Where does shared SigV4 signing/AWS credential types live?**
   Resolved: extracted a new, zero-dependency package, `@justjs/aws-sigv4`
   (`aws-sigv4/scm/main`), exporting `signAwsRequest()` and
   `AwsCredentialsConfig`. Both `@justjs/cloud-connect` and
   `@justjs/ai-assist` depend on it; `cloud-connect`'s old
   `core/aws_sigv4.ts` was deleted, not left as a duplicate. Verified: the
   package's own 5-test suite passes (including a new
   `test_different_services_produce_different_signatures_for_the_same_request_shape`
   regression test), `cloud-connect` migrated onto it with its full suite
   still at 37/37, and a full root `bun run build`/`typecheck` is clean
   across every package.
2. **Redundancy or model diversity?** Resolved: **redundancy**, not model
   diversity. `BedrockAiAssistProvider` targets only Claude-family models
   (`anthropic.claude-3-5-haiku-*` / `anthropic.claude-3-5-sonnet-*`) —
   the same models the `"anthropic"` strategy already serves, reached
   through AWS credentials as a second auth path, not a route to
   Bedrock's non-Claude models (Titan, Llama, Mistral). Those would need
   their own prompt tuning per method and are out of scope here.
3. **Model selection surface.** Resolved: `BedrockAiAssistConfig` extends
   `AwsCredentialsConfig` with a required `region` (Bedrock's endpoint
   host is itself region-scoped, unlike Anthropic's single global host)
   plus optional `completeModel`/`capableModel` overrides, defaulting to
   `anthropic.claude-3-5-haiku-20241022-v1:0` /
   `anthropic.claude-3-5-sonnet-20241022-v2:0`. `AiAssistProviderConfig`
   is now `AnthropicAiAssistConfig | BedrockAiAssistConfig`.
4. **Which methods ship first?** Resolved as proposed: `complete()` and
   `chat()` are real, tested, and live-verified. The remaining 6 methods
   (`review`/`scaffold`/`scaffoldProject`/`generateDesignDoc`/
   `generateSlides`/`agentStep`) each throw a real
   `AiAssistProviderError("NOT_IMPLEMENTED", ...)` naming the Anthropic
   strategy as the fallback — an honest gap, not a silent stub returning
   empty data.

## Implementation evidence

- `ai-assist/scm/main/src/core/bedrock_provider.ts` — real
  `BedrockAiAssistProvider`, SigV4-signed `POST .../model/<id>/invoke`
  requests via `@justjs/aws-sigv4`.
- A real, pre-existing bug was found and fixed as a prerequisite:
  `saf/index.ts`'s `createAiAssistProvider()` hardcoded
  `new AnthropicAiAssistProvider(...)` directly, bypassing the SPI
  registry `spi/index.ts` already populated — a second strategy
  registered but unreachable through the factory would have been useless.
  Fixed: `createAiAssistProvider(strategy, config)` now resolves through
  `justjs.providers.resolve("aiAssist", strategy)`, matching every other
  `*-connect` package's own factory pattern. The one real call site
  (`scm/examples/ai-code-editor/src/core/ai_assist.ts`) was updated
  accordingly.
- 18 new tests in `ai_assist_int_test.ts` (construction validation,
  request shape for both `complete()`/`chat()` including the signed
  headers and Bedrock's `anthropic_version`/model-ID-in-path shape, image-
  attachment rejection, all 6 `NOT_IMPLEMENTED` methods, Bedrock's real
  flat `{message}` error-body shape, network-failure wrapping, SPI
  self-registration, and the `createAiAssistProvider` factory resolving
  both strategies plus rejecting an unknown one) — full suite 48/48.
- Live-verified against real AWS Bedrock using the actual
  `BedrockAiAssistProvider` class end-to-end (not just the signing
  function in isolation): `complete()` and `chat()`, called with
  well-formed but intentionally-invalid credentials, both returned AWS's
  real `403: "The security token included in the request is invalid."`
  — confirming the full signing → HTTPS request → error-body-parsing →
  `AiAssistProviderError` path is correct.
- Explicitly out of scope for this pilot: wiring "bedrock" as a
  selectable strategy in `ai-code-editor`'s own Settings UI — real,
  separate follow-up work tracked by justjs#145, not part of proving the
  strategy itself works.

## Acceptance criteria

- [x] A real decision recorded on the shared-signing-location question
- [x] A real decision recorded on redundancy vs. model-diversity scope
- [x] Which method(s) ship first, with reasoning
- [x] Real implementation: `BedrockAiAssistProvider` (`complete`/`chat`),
      tested (48/48) and live-verified against real AWS Bedrock
- [x] Full workspace build/typecheck/test suite stays green

## Relates to

- [ADR-0017](ADR-0017-cloud-provisioning-concern.md) — `signAwsRequest()`,
  the CORS-verification methodology this ADR reuses directly
- Tracked by justjs#145
