# ai-code-editor

One composition root (`src/app.ts`), compiled unmodified for two targets:
a real browser (`vite build`) and Android (`justc build --bundle --format
iife`, via `js-runtime`'s generator) — same pattern
`scm/examples/agentic-memory-demo`/`cross-target-demo` already proved. A
lightweight code editor with real, working AI assistance backed by
Anthropic's Claude via `@justjs/ai-assist` — this ecosystem's first
example built against a real third-party LLM API, not a dummy/heuristic
stand-in.

- **Editor** (`x-editor`, `/editor`) — a file-explorer sidebar (real
  nested folders, `core/fs.ts`) alongside the code buffer: a
  `<textarea>` (transparent text, visible caret) laid directly over a
  regex-highlighted `<pre>` (`core/highlight.ts`), with a synced
  line-number gutter. "✨ Suggest" calls `complete()` with the text
  before/after the cursor and inserts the result. "🔍 Review" calls
  `review()` on the active file and jumps to the Review tab.
- **Chat** (`x-chat`, `/chat`) — a real conversation with Claude, given
  the active file's content as context on every turn via `chat()`. Press-
  and-hold the mic to dictate instead of typing (auto-sends on release).
  Attach a screenshot (📷) and Claude actually sees it — real vision
  input, not just local display — e.g. "what's wrong with this error".
- **Review** (`x-review`, `/review`) — the last structured `review()`
  result for whichever file it ran against ("Reviewing: `<path>`"):
  severity-badged findings, clickable when they carry a line number
  (jumps back to Editor, switching to that file first if a different one
  is currently open, then selects the line). Can also attach a screenshot
  before running — e.g. "here's the error this throws".
- **Scaffold** (`x-scaffold`, `/scaffold`) — two modes. "New File"
  generates one file's content via `scaffold()` and creates it at a given
  path. "New Project" generates a whole small multi-file project via the
  new `scaffoldProject()` (structured multi-file tool-use output, same
  mechanism `review()` uses) and replaces the project wholesale on an
  explicit "Replace project" confirm. Nothing is ever applied
  automatically — creating/replacing is always an explicit tap. Both
  description fields support voice dictation (no auto-Generate on
  release, unlike Chat — Generate is a deliberate, sometimes-costly
  action); only New Project also accepts a screenshot ("build this from
  this mockup").
- **Workspace** (`x-workspace`, `/workspace`) — an SDLC hub: 9 widgets
  (the 8 SDLC stages — Ideation, Requirement, Planning, Design,
  Development, Testing, Deployment, Operations — plus Presentation),
  same widget-grid-then-drill-down architecture `agentic-memory-demo`'s
  Memories tab established. Four stages link to real, working tabs this
  app already has — Ideation→Chat, Planning→Scaffold, Development→Editor,
  Testing→Review. **Design**'s two entries, Architecture and Wireframes,
  are both real (not stubs) — both open the same inline capability
  (below), since one generated doc genuinely covers both. **Deployment**'s
  Cloud entry is also real (not a stub) — a fixed catalog of actual,
  recognizable cloud providers (AWS, Google Cloud, Microsoft Azure,
  DigitalOcean, Cloudflare, Vercel, Netlify, Heroku), each with a real
  "Connect" screen: paste a token (or, for AWS, an access key ID +
  secret access key) and see that account's actual resources, called
  directly from the browser with no backend proxy (this app has none) —
  see "Real cloud provider connections" below for exactly what's real,
  what each provider needs, and the security tradeoffs. **Presentation**'s Slides entry is also real
  (not a stub) — an AI-generated slide deck (below), opened directly
  since it's the stage's only function (unlike Design's two entries
  sharing one generator). **Development**'s CLI entry is also real (not
  a stub) — a real terminal against this app's own virtual filesystem
  (below), not an AI-backed interpreter and not a real OS shell.
  **Development**'s Repository entry is also real (not a stub) — the
  source-control equivalent of Deployment's Cloud: a real "Connect"
  screen for GitHub, GitLab, or Bitbucket (paste a Personal Access
  Token, see that account's actual repositories), called directly from
  the browser — see "Real source-control connections" below.
  **Requirement**'s Specs/User Stories and **Planning**'s new Project
  Boards entries are also real (not stubs) — all 3 open the same real
  project-management "Connect" screen for Linear, Asana, Trello, or
  Jira, see "Requirement & Planning — real project-management
  connections" below. Operations still shows its entry as an
  honestly-labeled "Coming soon" stub, not a fake-functional button.
- **Communication** (`x-communication`, `/communication`) — the 6th
  top-level tab, not nested inside Workspace: a real "Connect" screen
  for Slack, Discord, or Microsoft Teams (paste a real bot/access
  token, see that account's actual channels/guilds/teams), same
  no-backend-proxy posture as every other real connection in this app —
  see "Real communication connections" below.
- **Socials** (`x-socials`, `/socials`) — the 7th top-level tab, same
  standalone shape as Communication: a real "Connect" screen for
  Mastodon, Bluesky, or Reddit, plus X (Twitter) and LinkedIn shown
  honestly as not available — see "Socials — real, 7th top-level tab"
  below.

## Requirement & Planning — real project-management connections

Requirement's Specs/User Stories and Planning's Project Boards all open
the same real connect screen — one real capability shared across two
different stages, the same precedent Design's Architecture/Wireframes
already established within a single stage. Backed by a fourth real
framework package, `@justjs/pm-connect`, same `api`/`core`/`saf`/`spi`
shape as `@justjs/cloud-connect`/`@justjs/scm-connect`/
`@justjs/comms-connect`/`@justjs/social-connect`. Notably: this package
ships with **no shared generic bearer-GET engine** — all 4 chosen
providers turned out to have genuinely distinct real logic, so a shared
engine would have had zero real users, a deliberate simplification
rather than an oversight.

- **Linear** — a real GraphQL POST (not a GET, unlike every bearer
  provider in the other 4 packages), and a real, deliberate deviation
  from convention: the API key goes in `Authorization: <token>` with
  **no `Bearer` prefix** (confirmed via Linear's own docs — sending one
  fails auth).
- **Asana** — real 2-call sequence: discover the first real workspace,
  then list the current user's real tasks within it (Asana's API has no
  single "my tasks everywhere" endpoint — confirmed via Asana's own
  docs, same real-limitation shape Bitbucket's own provider already
  established in `@justjs/scm-connect`). A real, easy-to-miss gotcha
  baked in: Asana's default task fields omit `completed` entirely unless
  explicitly requested via `opt_fields`.
- **Trello** — real auth via **query parameters**, not a header:
  `?key=<apiKey>&token=<token>`, both pasted from Trello's own developer
  pages — a real 2-field form, same shape as AWS's/Jira's own two-field
  screens. Trello's real 401 responses are plain text
  (`"invalid token"`/`"invalid key"`), not JSON — handled explicitly
  rather than assumed.
- **Jira** — the one provider needing real, materially more work. Live
  research during design found Jira's classic per-site Basic-auth REST
  API has **no CORS support at all** (confirmed via Atlassian's own bug
  tracker, JRACLOUD-65573) — only the OAuth 2.0 (3LO) path through
  `api.atlassian.com` supports real browser CORS, and Atlassian's token
  exchange requires a real `client_secret` with **no PKCE alternative**
  for public clients. The resolved design: the same
  bring-your-own-OAuth-app pattern `@justjs/social-connect`'s Reddit
  integration already established (the user registers their own
  Atlassian OAuth app and pastes its Client ID + Secret — never
  hardcoded or shipped in this app's bundle), plus the one genuinely new
  mechanic anywhere in this codebase: clicking "Connect" navigates the
  real browser to Atlassian's real consent screen
  (`core/pm_connect.ts`'s `beginJiraConnect()`), and `app.ts`'s `main()`
  detects the real `code`/`state` return params before normal boot,
  completes the token exchange (`@justjs/pm-connect`'s
  `exchangeJiraAuthorizationCode()` — a real 2-call sequence: exchange
  the code, then discover the real Jira Cloud site id via the
  `accessible-resources` endpoint), persists the resulting session, and
  clears the URL via `history.replaceState` (no reload) before landing
  on the Workspace overview rather than trying to restore the exact
  prior drill-down. A real CSRF `state` nonce is generated and checked
  on return (`sessionStorage`, since it only needs to survive one
  round-trip in the same tab). Token refresh is out of scope — Jira
  sessions are short-lived and this app doesn't refresh them, the same
  "reconnect when needed" posture Azure's/GCP's own CLI-issued tokens
  already have in `@justjs/cloud-connect`, stated plainly rather than
  silently gapped. Jira's own real, non-deprecated search endpoint
  (`/rest/api/3/search/jql` — the older `/search` is deprecated/removed)
  is deliberately not paginated beyond the first page: real 2026
  community reports describe its `isLast`/`nextPageToken` fields looping
  rather than terminating, so a bounded single call is safer than an
  unbounded loop trusting a documented-buggy signal.

**Notion was checked and excluded** — confirmed live to have no CORS
support at all, unlike every provider actually shipped here.

Every endpoint was confirmed live before being wired up: CORS headers
checked directly for all 5 candidates (including Notion's exclusion),
and the exact real request/response shapes (auth conventions, endpoint
paths, field names) verified against each provider's own current
documentation before writing any code.

## Design — Markdown + Mermaid doc generator

Design's Architecture and Wireframes entries both open the same real,
inline generator — a new `generateDesignDoc()` capability (own prompt,
not `scaffold()` reused — `scaffold()` explicitly tells Claude to omit
markdown fences, which fights intentionally emitting a ` ```mermaid `
one) that produces a Markdown document with an embedded Mermaid diagram
from a description, with an Edit/Preview toggle (Edit: raw source,
editable; Preview: rendered HTML + diagram) and a "Create file" action
that reuses the real file explorer's collision check (`core/fs.ts`'s
`pathExists()`) exactly like Scaffold's own "Create file" flow —
generated docs land in the real project, not a dead end. Tapping either
Architecture or Wireframes opens the exact same generator with whatever
was last generated still there (not two separate, half-built copies) —
`workspace.ts`'s own drill-down goes one level deeper here than every
other stage (Workspace → Design's Architecture/Wireframes list → the
shared generator), since two distinct entries both needed to lead
somewhere real.

**This is the first real third-party npm dependency (`mermaid`, pinned
exact at `11.16.0`) in any example app in this repo** — a deliberate,
acknowledged reversal of the line this app's own "Why a hand-rolled
editor" section draws (every dependency across all four example apps
before this was `@justjs/*` plus dev-only tooling). Mermaid's real SVG
diagram rendering has no reasonable hand-rolled equivalent, unlike
`core/highlight.ts`'s regex syntax highlighter.

**The import is never static.** `import mermaid from "mermaid"` never
appears as a top-level import anywhere reachable from `app.ts`. This app
is one composition root compiled unmodified for both `vite build` (web)
and `justc build --bundle --format iife` (Android), and every route
mounts eagerly at boot — a static import would execute at module-
evaluation time on **both** targets regardless of whether Design is ever
opened, and given `justscript_compiler#4` (`--bundle` a no-op for
`--target js`), that risks taking down the app's *entire* Android boot,
not just gracefully degrading one feature. `core/markdown.ts` instead
uses a lazy `await import("mermaid")` inside the one function that
actually renders a diagram, wrapped in try/catch — confirmed via a real
build that Vite code-splits it into its own lazily-loaded chunks (the
main `index-*.js` entry stays ~88KB; `mermaid.core-*.js` and dozens of
per-diagram-type chunks, several hundred KB combined, load only when
Design's Preview is actually used).

**`happy-dom` (this app's `verify_web.mjs` test environment) genuinely
cannot render Mermaid** — confirmed via research, not assumed: Mermaid
depends on `SVGTextElement.getBBox()` for text measurement, which
DOM-emulation libraries don't implement meaningfully; Mermaid's own
maintainers point headless/server-side users at Puppeteer (a real
browser engine) for exactly this reason. `core/markdown.ts` catches this
and falls back to the raw ` ```mermaid ` source plus a "couldn't be
rendered in this environment" note — required for the app to degrade
gracefully in any constrained environment, not just for the test suite.
`verify_web.mjs` asserts this real fallback path (via a temporary fake
API key + a mocked `globalThis.fetch` returning a canned Anthropic-
shaped response — not a real network call, but real app logic:
`generate()` → Edit/Preview toggle → real dynamic `import("mermaid")` →
real attempted render → real fallback → "Create file" reusing the real
collision check), not a hand-waved assumption that rendering works.

**Real Mermaid SVG rendering in an actual browser has not been visually
confirmed this session** — the Chrome browser-automation tooling wasn't
connected in this environment. This is a genuine, stated gap, not a
silent assumption: before calling this feature fully done, open
`bun run dev`, add a real Anthropic API key in Settings, generate a
design doc, and confirm Preview shows a real rendered diagram (not just
that the fallback note correctly *doesn't* appear).

## Deployment — real cloud provider connections

Deployment's Cloud entry is real, not a stub, and not just a local list
either: tapping a provider (`workspace.ts`'s `CLOUD_PROVIDER_CATALOG`)
opens its own connect screen, and connecting calls that provider's real
API, directly from the browser, no backend proxy (this app has none) —
same posture as the Anthropic key. Every endpoint was confirmed live
(CORS headers checked directly) before being wired up.

7 of 8 providers are connectable, split into two real shapes:

- **A pasted bearer token** (DigitalOcean, Netlify, Vercel, Heroku,
  Microsoft Azure, Google Cloud) — same UX as the Anthropic key: paste,
  Connect, stored in `localStorage` only, sent in every request.
  Azure/Google Cloud's tokens come from the user's own CLI
  (`az account get-access-token` / `gcloud auth print-access-token`,
  shown verbatim in the connect screen) rather than a full OAuth-in-SPA
  flow — real, short-lived (~1 hour), and needs zero app-registration
  setup before the feature works. A full OAuth flow (MSAL.js / Google
  Identity Services) is real and buildable but a materially bigger v2,
  not attempted here.
- **AWS** — a real access key ID + secret access key pair and real
  client-side SigV4 request signing (`@justjs/cloud-connect`'s
  `core/aws_sigv4.ts`, Web Crypto only, no AWS SDK dependency —
  cross-checked against an independent Node-crypto implementation of
  the same spec before trusting it, not assumed correct). CORS being
  enabled doesn't remove AWS's signing requirement (confirmed against
  AWS's own docs). "Connect" always calls STS `GetCallerIdentity` first
  — AWS's own docs: "No permissions are required" — the safest possible
  proof the credentials work. Listing real EC2 instances
  (`DescribeInstances`) is a separate, opt-in button shown only after a
  successful connect, since it needs the real `ec2:DescribeInstances`
  IAM permission GetCallerIdentity doesn't. The connect screen surfaces
  AWS's own guidance directly: prefer short-lived/temporary credentials
  over a long-term key pair like this one.

**Cloudflare stays local-list-only.** Its API returned no CORS headers
when checked directly from a browser — connecting isn't confirmed
possible without a backend proxy, so its screen says so honestly rather
than offering a connect form that might silently fail.

**This is a real `@justjs/*` framework package (`@justjs/cloud-connect`),
not app-local code.** The first attempt hand-rolled these 7 providers'
fetch calls directly inside this app — exactly the kind of hand-rolling
`@justjs/ai-assist` already exists to prevent for third-party API
integrations. Corrected into a real package mirroring `@justjs/ai-assist`'s
own `api`/`core`/`saf`/`spi` structure: `core/` holds the shared
`DefaultCloudConnectProvider` generic engine plus AWS/Netlify/Vercel/
Heroku's own distinct classes (signing, or real deploy logic — see
below); `spi/<provider>.ts` (one file per provider) holds each
provider's real URL/config and self-registers itself with
`justjs.providers.register({concern: "cloudConnect", strategy, ...})`.
Git, previously listed here, moved to Development's real "Repository"
entry (see below) — a repository is a development-stage concern, not a
deployment one.

### Real "Deploy this project" — Netlify, Vercel, Heroku

Beyond connecting, 3 of the 8 cloud providers can also push this app's
own current project (the Editor's virtual filesystem) to a real, live
deployment — a "Deploy this project" button appears in their connect
screen once a successful connect has proven the credential works (same
opt-in-after-connect gating AWS's "List EC2 Instances" already
established). All three real request shapes were confirmed live (CORS
headers checked directly) before being wired up:

- **Netlify** — a real digest-based deploy: create (or reuse) a site,
  hash every file with real Web Crypto SHA-1, tell Netlify the
  `{path: sha1}` manifest, upload only the files it reports back as
  `required`, then poll the deploy's real `state` until `"ready"`. No
  archive format needed anywhere in this flow.
- **Vercel** — files are inlined directly (base64) in one deployment-
  creation call — no separate upload step at all. A project auto-
  upserts by `name`, so redeploying with the same name updates the same
  real project.
- **Heroku** — the one genuinely bigger flow: a real presigned upload
  URL pair (`POST /apps/{app}/sources`), a gzipped tarball PUT to it,
  then a real build referencing that URL, polled until Heroku's own
  build `status` settles. Building the tarball needed a hand-rolled
  minimal USTAR writer (`@justjs/cloud-connect`'s `core/tar_writer.ts` —
  fixed 512-byte header blocks, octal-encoded size/checksum fields,
  piped through the real `CompressionStream("gzip")` Web API) since no
  third-party archive library exists anywhere in this codebase and no
  native browser API builds a tar/zip container directly. **A stated,
  honest verification gap**: the presigned `put_url` points at a
  different origin than `api.heroku.com` (Heroku's own S3-backed
  storage) — its real CORS support for a direct browser PUT could not
  be independently confirmed this round (getting a real presigned URL
  needs a real authenticated Heroku call). If that upload fails, the app
  surfaces a real, honest error naming this specific possibility rather
  than a generic one.

**Redeploying reuses the same target**, not a new site/app every click
— the real site id (Netlify), project name (Vercel), or app id (Heroku)
a successful deploy returns is persisted in `localStorage`
(`core/cloud_credentials.ts`'s `getStoredCloudDeployTarget`/
`setStoredCloudDeployTarget`) and passed back in on the next deploy,
matching how the Netlify/Vercel/Heroku CLIs themselves behave.

**A real, necessary framework extension**: Heroku's tarball PUT needed
a genuine binary request body, which `@justjs/network`'s `FetchAdapter`/
`@justjs/transport`'s `ApiAdapter` didn't support before this round
(`FetchRequest.body` was typed `string | FormData` only, and
`DefaultApiAdapter` would have silently JSON-stringified a `Uint8Array`
into an array of numbers instead of sending real bytes). Both packages
now accept `Blob`/`ArrayBuffer`/`Uint8Array` bodies too, passed straight
through to the real `fetch()` call unchanged — a small, additive,
backward-compatible extension to two foundational packages, with its
own new regression tests in each package's own suite (a real local HTTP
server confirming the exact bytes arrive unmodified, not just that the
call didn't throw).

**DigitalOcean/AWS/Azure/GCP have no deploy support, with real
reasons.** DigitalOcean App Platform only deploys from a Git repository
or container registry image — no direct-file-upload deploy API exists
at all (confirmed via research). AWS/Azure/GCP would each need real
infrastructure provisioned first (an S3 bucket with static-website
hosting and a bucket policy for AWS; an App Service/Cloud Run
application for Azure/GCP) — a materially bigger scope than "paste a
token, deploy," out of scope here.

## Development — real source-control connections

Development's Repository entry is real too, the source-control
equivalent of Deployment's Cloud above, via a second, separate real
framework package: `@justjs/scm-connect`, same `api`/`core`/`saf`/`spi`
shape as `@justjs/cloud-connect`. 3 real providers, all a single pasted
bearer token (a real Personal Access Token) — no AWS-style signing
needed for any of them:

- **GitHub** (`GET /user/repos`) and **GitLab** (`GET /api/v4/projects?membership=true`)
  are the same one-call pattern — both are `DefaultScmConnectProvider`
  instances (`@justjs/scm-connect`'s own generic engine), just
  configured with a different URL and response parser.
- **Bitbucket** is not — its API has no single cross-workspace
  repo-list endpoint (confirmed via search, not assumed), unlike
  GitHub/GitLab. Its own `BitbucketScmConnectProvider` does two real
  calls: list workspaces, then list the *first* workspace's
  repositories — a real, disclosed limitation (not silently presented
  as "every repository across every workspace you belong to").

Every endpoint was confirmed live (CORS headers checked directly, and a
real invalid-token 401 confirmed the exact request shape) before being
wired up — same verification standard `@justjs/cloud-connect` was held
to.

## Communication — real, 6th top-level tab

Communication (`/communication`) is a real, third framework package,
`@justjs/comms-connect`, same `api`/`core`/`saf`/`spi` shape as
`@justjs/cloud-connect`/`@justjs/scm-connect` — but it's a top-level
tab in its own right, not nested inside Workspace like Cloud/Repository
are. A real 6th route: its own mount container, nav button, and
`justweb.toml`/`routes.yaml` entries, generated the same way the
original 5 were (`justjs#95`'s retrofit) — `app.ts` itself needed
exactly one new line (a side-effect import), since its route resolution
already reads entirely from the generated `dom-address-map.json`/
`routes.gen.json`, no hardcoded route list to edit.

3 real providers:

- **Discord** and **Microsoft Teams** are the same one-call bearer-token
  pattern GitHub/GitLab already proved — both `DefaultCommsConnectProvider`
  instances. The one real difference: Discord's own documented
  convention for bot tokens is `Authorization: Bot <token>`, not
  `Bearer` — the generic engine's `authScheme` is configurable per
  provider specifically for this. Microsoft Teams' token comes from
  `az account get-access-token --resource-type ms-graph`, the same
  short-lived-CLI-token pattern Azure already uses.
- **Slack** is not a generic-engine instance — its API always answers
  HTTP 200, even on auth failure, confirmed live with a fake token
  (`{"ok":false,"error":"invalid_auth"}`). A naive HTTP-status check
  would silently treat that as success. `SlackCommsConnectProvider`
  checks the real `ok` field instead — the same real-quirk-gets-its-own-
  class treatment AWS/Bitbucket already got in the other two packages.

Every endpoint was confirmed live (CORS headers checked directly, and a
real invalid-token error confirmed the exact request/response shape,
including Slack's 200-but-`ok:false` body) before being wired up.

## Socials — real, 7th top-level tab

Socials (`/socials`) is a real, fourth framework package,
`@justjs/social-connect`, same `api`/`core`/`saf`/`spi` shape as
`@justjs/cloud-connect`/`@justjs/scm-connect`/`@justjs/comms-connect` —
another standalone top-level tab, not nested inside Workspace, same
real 7th-route wiring mechanics Communication's 6th route already
proved (`app.ts` needed exactly one new line again).

5 providers shown, 3 real and connectable, 2 honestly not:

- **Mastodon** is the same one-call bearer-token pattern
  Discord/Microsoft Teams already proved — a `DefaultSocialConnectProvider`
  instance against a single, real, well-known instance
  (`mastodon.social` — same fixed-single-region simplification AWS's
  STS/EC2 calls already use), listing the account's real lists.
- **Bluesky** is not — the AT Protocol has no static bearer token at
  all. Its own `BlueskySocialConnectProvider` does two real calls: a
  real `com.atproto.server.createSession` exchange (a real "App
  Password" — generated on bsky.app, never the account password —
  plus the account identifier) returning a `did` and a short-lived
  `accessJwt` (confirmed via Bluesky's own docs: expires after a few
  minutes), then one `app.bsky.graph.getFollows` call using that
  momentary token. Nothing but the identifier/App Password is ever
  persisted — connecting re-authenticates fresh every time rather than
  trying to cache a fast-expiring session.
- **Reddit** is also not — a real OAuth2 `client_credentials` exchange
  (HTTP Basic `clientId:clientSecret` against `/api/v1/access_token`,
  confirmed live with a real `{"message":"Unauthorized","error":401}`
  for bad credentials) issues an **app-level-only** token: it proves
  the credentials work against real public data (`r/popular/hot`), it
  cannot list the connecting user's own saved posts or subscriptions —
  a real, disclosed limitation stated directly in the connect screen,
  not silently presented as "your Reddit account." Real personal access
  needs Reddit's full OAuth authorization-code consent flow, a
  materially bigger v2, not attempted here. Also real and disclosed:
  Reddit's CORS `Access-Control-Allow-Headers` does not include
  `User-Agent` (and browsers block scripts from overriding it
  regardless — a Fetch-spec forbidden header), so the request goes out
  with the browser's own default User-Agent rather than a custom
  app-identifying one; confirmed live this doesn't block the token
  exchange itself.

**X (Twitter) and LinkedIn stay local-list-only**, same honest
treatment Deployment's Cloud already gives Cloudflare. Both APIs
returned no CORS headers when checked directly from a browser —
connecting isn't confirmed possible without a backend proxy, so both
screens say so rather than offering a connect form that might silently
fail.

Every endpoint was confirmed live before being wired up: CORS headers
checked directly for all 5 providers, and a real invalid-credential
request against each of the 3 connectable providers' own APIs
confirmed the exact error shape — Mastodon's plain 401, Bluesky's real
`{"error":"AuthenticationRequired","message":"Invalid identifier or
password"}` body, and Reddit's real
`{"message":"Unauthorized","error":401}` body.

## Presentation — AI-generated slide deck

Presentation's Slides entry is real, not a stub: a new
`generateSlides()` capability on `@justjs/ai-assist` (own dedicated
prompt, not `generateDesignDoc()` reused — a deck needs terse per-slide
bullets rather than document prose, and a diagram is optional per slide
rather than mandatory once overall) producing a Markdown deck with
slides separated by a bare `---` line — the real convention Marp/
reveal-md use, so the generated `slides.md` is a genuinely useful file
outside this app too, not an app-internal format. Unlike Design's
Architecture/Wireframes (two entries sharing one generator), Slides is
the stage's only function, so tapping it opens the generator directly.

Preview shows **one slide at a time**, not a continuous scroll like
Design's — `core/markdown.ts`'s new `splitMarkdownSlides()` splits the
raw source into per-slide chunks at a bare `---` line before any
rendering happens, fence-aware (a `---` inside a slide's own code sample
is never mistaken for a slide break, reusing the same
`FENCE_PATTERN`/`CLOSING_FENCE_PATTERN` `splitBlocks()` already tracks
fence state with). The split pattern is deliberately narrower than
`renderTextBlock()`'s own `<hr>` regex (exactly 3 dashes, not 3-or-more
or `***`) — the prompt reserves bare `---` exclusively for slide breaks
and tells the model to use `----` for an actual in-slide rule, so a real
Design doc's genuine `<hr>` is untouched and `renderMarkdownToHtml()`
itself stays completely slide-agnostic, called once per slide chunk
rather than ever being taught about slides at all. Prev/Next buttons and
a "Slide X of N" indicator drive `currentSlideIndex`; switching slides
re-runs `renderMarkdownToHtml()` for just that slide, guarded by its own
`slidesRenderToken` (independent from Design's `designRenderToken` —
these are two parallel drill-downs, each with its own in-flight async
Mermaid render to guard against a fast Next/Prev tap or a regenerate
mid-render).

A genuinely useful finding from testing this against real `mermaid.render()`
calls in `happy-dom`, not just assumed: **not every Mermaid diagram type
fails the same way in `happy-dom`.** Design's own test uses a
`sequenceDiagram` (confirmed to reliably throw, due to `getBBox()`, and
correctly hit the fallback path). A `flowchart` diagram, tried while
building this feature's own test, does **not** throw — but also doesn't
produce a well-formed `<svg>` wrapper (`mermaid.render()` resolves
successfully with content that's missing its own root `<svg>` tag). That
third outcome wasn't something `renderMermaidBlock()`'s `try`/`catch`
could detect on its own (it only catches thrown errors) - fixed by
validating the resolved `svg` string structurally (`isWellFormedSvg()`,
`core/markdown.ts`: trimmed content must start with `<svg` and end with
`</svg>`) and throwing when it isn't, routing malformed-but-resolved
output into the exact same fallback a thrown error hits. `verify_web.mjs`'s
Slides test proves both paths now - slide 2 (`sequenceDiagram`, throws
directly) and slide 3 (`flowchart`, resolves but gets rejected by
`isWellFormedSvg()`) both correctly show the fallback note, not broken or
partial markup.

## Development — CLI (a real virtual-filesystem shell)

Development's CLI entry is real, not a stub: a new `core/cli.ts` module
(`runCliCommand(rawLine, cwd, files, emptyFolders)`, pure - no state, no
dispatch) running a bounded command set against this app's own virtual
filesystem — the exact same `FileMap`/`emptyFolders` the file explorer
already manages, not a parallel, fake one. Not an AI-backed interpreter,
and not a real OS shell — this app is browser-only with no backend to
shell out to.

Commands: `pwd`, `ls [path]`, `cd [path]`, `cat <path>`, `mkdir <path>`,
`touch <path>`, `rm [-r] <path>`, `mv <src> <dest>`, `cp <src> <dest>`,
`grep <pattern> [path]`, `find [path] [-name pattern]`, `echo <text>`,
`ssh <host>`, `help`, `clear`. Each mutating command returns a real
`AppAction` (`CREATE_FILE`/`CREATE_FOLDER`/`RENAME_PATH`/`COPY_PATH`/
`DELETE_PATH`) that `workspace.ts` dispatches into the real store —
running `mkdir` in the terminal makes the same folder show up in the
Editor's real file tree, not a terminal-only illusion. A few deliberate,
real-shell-faithful behaviors rather than shortcuts: `touch` on an
already-existing file is a silent no-op (this virtual filesystem has no
mtime field for `touch` to legitimately bump, and re-creating the file
would clobber real content with an empty string); `mv`/`cp file
existing-dir/` moves/copies into that directory under its own basename,
the single most-reached-for real invocation of either; `mv`/`cp` both
refuse to move/copy a folder into itself or its own descendant (`cannot
move/copy into itself`) — the underlying `RENAME_PATH`/`COPY_PATH`
reducers would otherwise silently produce a corrupted, double-nested
duplicate, since the file explorer's own rename UI can never trigger
this case (it only ever renames within the same parent, never to an
arbitrary destination elsewhere in the tree the way `mv`/`cp` can).
`COPY_PATH` (`core/state.ts`) is a new reducer action mirroring
`RENAME_PATH`'s exact structure but additive rather than replacing — the
source entries stay exactly where they are, copies are added alongside
them. `grep`/`find` returning zero matches is a real, honest empty
result, not an error — the same convention real `grep`/`find` use.
`echo` has no `>` redirection — a deliberate scope cut, not an
oversight. `clear` is a client-side terminal built-in (wipes the local
transcript) rather than a real filesystem command, matching how real
terminal emulators handle it — it never reaches `core/cli.ts` at all.

**`ssh` prints `ssh streaming coming soon` — an honestly-labeled
roadmap message, not a fake connection and not an error.** Same
"Coming soon" framing the Workspace hub's own stub widgets already use
elsewhere in this app, just delivered as CLI output instead of a UI
badge. Worth understanding why this one is a genuine "not yet" rather
than "trivially addable next": a browser page cannot open a raw TCP
socket at all — the only network primitives the web platform exposes
are `fetch`/`XHR` (HTTP(S) only) and `WebSocket` (needs a WebSocket
server on the other end, not an arbitrary TCP service). Even real "web
SSH" terminals (the kind cloud consoles ship) don't run SSH in the
browser either — they relay bytes over a WebSocket to a real backend
that opens the actual SSH connection server-side. This app has no
backend at all (same reason the Anthropic API key is called directly
from the browser instead of through a proxy — see below), so "streaming
coming soon" is honest about what it would actually take: a real
backend relay this app doesn't have today, not a small follow-up patch
to `core/cli.ts`.

## File explorer — flat path-keyed storage, not a recursive tree

`core/fs.ts` stores the virtual filesystem as `Record<path, FileNode>`
keyed by a `/`-joined path (e.g. `"src/utils/greet.js"`) — folders are
never stored as separate nodes, only inferred at render time by walking
path prefixes (`buildTree()`), the same way git/S3 represent directories.
Rename/delete are string-prefix operations over that flat map
(`isDescendantOrSelf()`, `renamedPath()`), not recursive tree mutation —
deliberately, to keep a class of bug (partial renames, orphaned
sub-trees) structurally impossible rather than something to test for.
Deleting a folder always deletes everything inside it (`rm -rf`
semantics, confirmed inline before it happens — no native `confirm()`
dialog anywhere in this UI, matching this codebase's existing aversion to
blocking dialogs). Rename/create collisions are rejected inline before
dispatch, never a silent last-write-wins overwrite. Persistence is one
debounced (~400ms) `store.subscribe()` in `app.ts`, not scattered calls
across every mutating action — `editor.ts`'s content-edit path dispatches
on every keystroke, and `DefaultFeatureStore` has no batching, so an
undebounced blanket subscribe would stringify the whole project on every
character typed.

## Voice input and real vision AI — reused, not reinvented, with two deliberate cuts

Voice (`core/speech.ts`) and the image-attach mechanics (`core/images.ts`)
are ported from `agentic-memory-demo`'s own `core/speech.ts`/
`core/images.ts`, not written from scratch. Two scope cuts, stated
plainly rather than silently omitted: this app only ported
`isVoicePromptSupported()`/`startVoicePrompt()`/`describeVoiceError()` —
not `agentic-memory-demo`'s paginated voice-language picker or its
text-to-speech (read-aloud) support. Voice input here always falls
through to `navigator.language`, with no in-app override.

Screenshots are genuinely new territory for this ecosystem, not a port:
`agentic-memory-demo`'s images are local-only (`FileReader` → data URL →
`<img>` display, never sent anywhere). Here, an attached screenshot is
real vision input — split into `{mediaType, base64Data}`
(`core/images.ts`'s `parseDataUrl()`) and sent as an Anthropic image
content block via a new `ImageAttachment` type and `toAnthropicContent()`
helper in `@justjs/ai-assist`. Client-side validation (unsupported type,
or over `core/images.ts`'s 4MB cap — comfortably under Anthropic's real
~5MB-after-base64-encoding limit) rejects a bad file at the file-picker
`change` event, before `FileReader` ever runs, with a real inline error
instead of a confusing 400 from Anthropic seconds later.

Screenshot attachment is one-shot everywhere: attach → run the action
(send/review/generate) → cleared, regardless of success or failure —
same as how the chat text input already cleared immediately on send
before this feature existed. A real bug caught by `verify_web.mjs`
during development: Review's and Scaffold's image-clearing calls were
originally placed *after* the "no API key configured" early return, so a
failed attempt silently left the attachment behind — fixed by clearing
before that check, matching the ordering `chat.ts` already had right.

## Android — voice/vision are web-verified only, not shipped as Android-ready

`agentic-memory-demo/android.manifest.json` lists `"voice"`/`"image"` in
its `capabilities` array, but neither string appears anywhere else in
this checked-out repo — not in `docs/6-deployment/playbook.md`'s
documented seven capabilities (`echo`, `notify`, `biometricAuth`,
`contacts`, `camera`, `health`, `location`), not in
`platform/mobile/scm/main/src/api/bridge.ts`'s independently-
corroborated same seven. `js-runtime` itself isn't checked out here to
confirm what (if anything) an unrecognized capability string grants, but
two non-stale sources agreeing, against zero supporting plumbing for
either string, means treating `agentic-memory-demo`'s manifest as proof
this works on Android would be the wrong inference. This app's
`android.manifest.json` deliberately keeps `"capabilities": []` — voice
input and screenshot attachment are built and verified against the
web/dev-server target only. `isVoicePromptSupported()` degrades
gracefully on Android the same way it does anywhere without
`SpeechRecognition` (the mic button just doesn't render); the file-input-
based screenshot attach UI will render on Android regardless, but tapping
it may not open a working native picker without the right capability
wired. Real Android verification for either feature is unconfirmed and
explicitly out of scope for this pass.

## Real security tradeoff, stated plainly

This app calls Anthropic's Messages API directly from browser/WebView JS,
using the documented `anthropic-dangerous-direct-browser-access: true`
opt-in header. That header exists specifically because this pattern is
discouraged outside personal/local tools: the API key lives in
`localStorage` and is sent in every request, visible to anyone inspecting
network traffic on the page. Every example app in this series is
local-only with no backend to proxy the call through, so this is an
accepted, understood tradeoff for a demo — not an oversight. The key is
entered by the user in the settings sheet (gear icon), stored in
`localStorage` only, never hardcoded or committed. The settings sheet
discloses this in-product, not just here.

## No streaming — a real UX consequence, not a silent limitation

`@justjs/network`'s `FetchAdapter` has no streaming support anywhere in
this codebase (`DefaultFetchAdapter.fetch()` fully buffers via `await
res.text()`, no `ReadableStream` path). Every AI response — completion,
chat reply, review, scaffold — arrives as one blocking wait with no
incremental/token-by-token display. This is also why completions are
button-triggered ("✨ Suggest"), not live-as-you-type ghost text: without
streaming, live-as-you-type would mean a blocking API call on every pause
in typing.

## Why a hand-rolled editor, not CodeMirror/Monaco

No example app in this ecosystem has ever pulled a real third-party npm
dependency through `justc`'s bundler for the Android target. Two real
open `justc` bugs make that a genuinely untested risk for a
multi-package dependency graph like CodeMirror 6's: `--bundle` is a
no-op for `--target js` (`justscript_compiler#4`), and non-JS/TS imports
like CSS are silently dropped with no warning (`justscript_compiler#5`).
The regex-based syntax highlighting this app uses instead
(`core/highlight.ts`) is the same tokenizing technique
(`text.match(/pattern/g)`) already proven to compile correctly through
`justc` for Android in `@justjs/memory`'s own `fake_embedding.ts` — it
carries none of that risk.

## Why `aiAssist` is never listed in `boot()`'s `aspects` config

`boot()`'s weave loop now forwards `aspects[concern].config` to the
resolved strategy's `spec.factory()` (`AspectConfig.config`,
`application/scm/main/src/core/boot.ts`) — so this is no longer a hard
blocker the way it originally was. This app still builds its real
singleton (`core/ai_assist.ts`'s `getAiAssistProvider()`) directly via
`createAiAssistProvider(config)` instead of through `boot()`'s `aspects`,
because the API key is loaded from `localStorage` *after* boot, not known
at boot time — `boot()`'s `aspects` config has no path for a value that
only exists once the app is already running. Same "throwaway weave-only
instance vs. the real singleton the app actually uses" pattern
`agentic-memory-demo/src/core/memory.ts` established for `@justjs/memory`,
just for a different reason now.

## Real navigation, not just a boot-time proof

Every route in `ROUTES` gets a real `justjs.router.navigate()` call once
at boot (proving the real Mount/Render/Update pipeline runs against every
route, not a narrated stand-in — the same pattern
`agentic-memory-demo`/`cross-target-demo` established). Every navigation
*after* boot — a nav-bar tap, or a component's own `navigateTo()` call —
also goes through a real `justjs.router.navigate()` call now (`app.ts`'s
`goToRoute()`), not just the boot-time loop. This used to rely purely on
a hand-rolled CSS `.active` toggle for every post-boot navigation, which
left `Router.currentPath()` permanently stuck on whichever route was last
in the boot loop, and ADR-0004's reactive re-render subscription wired to
that same stale route instead of whichever tab the user actually had
open. Calling `navigate()` for real on every navigation doesn't lose any
component state: each route resolves to its own distinct DDAS container,
and `adaptCustomElementRegistry()`'s `render()` reuses the existing
custom-element instance rather than recreating it, so nothing here is
destructive. `showRoute()`'s CSS toggle still exists alongside
`goToRoute()` for a separate, genuinely different concern — which
container is visually shown — since `Router` has no notion of hiding
inactive routes at all.

## Verification status — honest, not inflated

**Verified:** `@justjs/ai-assist`'s `bun test` passes 24/24 (includes
`scaffoldProject()`'s structured-output parsing, truncation handling via
`stop_reason`, duplicate/malformed-file rejection, the three
image-content-block tests for `chat()`/`review()`/`scaffoldProject()`,
`generateDesignDoc()`'s prompt/model/max_tokens shape, and
`generateSlides()`'s prompt/model/max_tokens shape). `vite build`
succeeds and confirms real code-splitting (the main entry stays ~88KB;
`mermaid` and its per-diagram-type chunks load lazily, several hundred
KB combined, only when Design's or Presentation's Preview is actually
used); `node verify_web.mjs` (real DOM via happy-dom against the real
built bundle) passes all 264 assertions — boot, DDAS mounting into all
seven routes, the Workspace hub's 9 widgets (the 8 SDLC stages in order,
plus Presentation) drilling into real live links vs. honestly-labeled
stubs correctly, Requirement's and Planning's real project-management
connect screens (one shared screen opened from 3 different entries
across 2 stages, Linear's real "paste a token first" error, Trello's
real two-field form and its own "enter both" error, Jira's real
two-field Client-ID/Secret form, its own "enter both" error, and a real
spied `window.location.assign` proof that a valid Connect click
navigates to Atlassian's real consent screen with the exact real query
parameters rather than resolving in place), Deployment's real cloud provider connect screens (a
bearer-token provider's real "paste a token first" error, AWS's real
two-field form and its own error, Azure's real CLI-token hint,
Cloudflare's honest "not available" state, and a real end-to-end
mocked-fetch "Deploy this project" flow for Netlify - connect, a real
Deploy button appearing only after a successful connect, and a real
clickable live-URL result), Development's real
source-control connect screens (GitHub's real "paste a token first"
error, the provider grid's own back-navigation), the Communication
tab's real connect screens (its own nav/route navigation proof, Slack's
real "paste a token first" error), and the Socials tab's real connect
screens (its own nav/route navigation proof, Mastodon's real "paste a
token first" error, Bluesky's real two-field form and its own "enter
both" error, Reddit's real two-field form and its own "enter both"
error plus its app-level-only disclosure text, X/LinkedIn's honest
"not available" states) - none of these four connect-screen sets makes
a live external network call in this suite, matching the Anthropic
key's own no-key-configured fast-path philosophy), Design's Architecture and Wireframes both opening the same
real generator (with the same in-progress doc, not two separate copies)
and its
generate→Edit/Preview→Mermaid-fallback→Create-file flow via a mocked-
fetch/real-app-logic technique (no real network call, but the real
dynamic `import("mermaid")`, the real attempted render, and the real,
confirmed-necessary fallback all genuinely execute), Presentation's
Slides opening its generator directly (a single real function, not two
entries sharing one) with the same generate→Edit/Preview→Create-file
flow proved slide-by-slide — real per-slide splitting (slide 2's content
never appears while slide 1 is showing), the nav indicator and Prev/Next
disabled-state tracking the real slide count and position, and both real
mermaid-fallback paths proved per-slide (a `sequenceDiagram` that throws
directly, and a `flowchart` that resolves but gets rejected by
`isWellFormedSvg()`'s structural check, both landing on the same honest
fallback note rather than broken markup), Development's CLI running a
real command sequence against the real virtual filesystem (`pwd`/`ls`/
`cd`/`cat`/`mkdir`/`touch`, including the no-clobber-on-an-existing-file
proof/`rm`(`-r`)/`mv`/`cp` including the move-and-copy-into-directory
expansion and the move/copy-into-itself guards/`grep` finding a real
match with real `file:line:content` output and a real, honest empty
result on no match/`find` locating a real path by `-name` and listing a
real subtree with no filter/`ssh`'s honest "not available" error/an
unknown-command error/`clear`), each mutating command's effect confirmed
in the real file tree, not just the terminal's own transcript, the
starter tree rendering real nested
folders with the active file's ancestors auto-expanded, the regex
highlighter tokenizing keywords/numbers, file switching, create/rename/
delete for both files and folders (including collision rejection and the
folder-with-real-files cascade-delete confirmation copy), a cross-file
jump-to-line dispatched through the real event bus `review.ts` would use,
the settings sheet's API-key save/clear/status round-trip through
`localStorage`, mic buttons correctly absent given happy-dom's genuine
lack of `SpeechRecognition` (confirmed directly, not assumed), a real
screenshot attach/preview/wrong-type-rejection/oversized-rejection/
remove/clear-after-use flow on Chat/Review/Scaffold-New-Project via a
real `File`+`DataTransfer`+`change` event (same technique
`agentic-memory-demo/verify_web.mjs` already uses), every AI action
(Suggest, Review, both Scaffold modes, Chat — with and without an
attached screenshot) failing loudly with a real, actionable "add an API
key" message when none is configured, and the whole project's real
`localStorage` persistence round-trip. Full root `bun run build`/
`typecheck`/`test` also passes clean across every sibling package — no
regression introduced elsewhere.

**Not verified by the fast default path:** an actual authenticated call
to Anthropic. `verify_web.mjs` has an opt-in live-call section gated
behind `AI_CODE_EDITOR_LIVE_TEST=1` **and** a real `ANTHROPIC_API_KEY`
env var (costs a real, billed API call — skipped by default, same
pattern as `agentic-memory-demo`'s `VERIFY_FORGETTING=1`). Also not
verified: real Mermaid SVG rendering in an actual browser (see "Design —
Markdown + Mermaid doc generator" above) — `happy-dom` genuinely cannot
render it, so the fast path only proves the fallback path works, not
that a real diagram renders when Mermaid genuinely can run.

**Not verified at all yet:** real Android hardware. This would be the
first authenticated third-party POST from the Android target in this
ecosystem. `cross-target-demo/README.md` already documents one
real-device-only failure mode for network calls on this exact stack
(Doze/App Standby blocking background fetch, fixed by waking the screen
and foregrounding the app before retry) — a similar or different failure
mode for this specific call is plausible and unconfirmed. Whether
Android's WebView JS engine honors the
`anthropic-dangerous-direct-browser-access` CORS opt-in identically to
desktop Chrome is also genuinely unconfirmed. `android.manifest.json`
declares `"capabilities": []` since INTERNET is unconditional in
js-runtime's manifest template (not capability-gated,
`cross-target-demo/README.md`) — no js-runtime changes are needed to
build the Android target, but building is not the same as verifying the
real call works on-device. A dedicated real-hardware pass with a real API
key is required before calling the Android target done. Voice input and
screenshot attachment specifically are not even expected to work on
Android yet — see "Android — voice/vision are web-verified only" above.

## Building

```sh
# Web
bun install
bun run build      # -> dist/, or `bun run dev` for a live server
node verify_web.mjs # real-DOM check via happy-dom - boot, DDAS mounting,
                     # highlighting, tab switching, file explorer,
                     # settings API-key round-trip, real screenshot
                     # attach/reject/clear flows, every AI action's
                     # no-key error state (with and without an image)
AI_CODE_EDITOR_LIVE_TEST=1 ANTHROPIC_API_KEY=sk-ant-... node verify_web.mjs
                     # also exercises one real, billed Suggest call
                     # (skipped by default)

# Mobile (from js-runtime's main/features/mobile-bridge/) - builds only,
# NOT yet verified against a real Anthropic call on real hardware (see
# "Verification status" above)
bash scripts/generate-android-app.sh \
  /path/to/justjs/scm/examples/ai-code-editor/android.manifest.json \
  <output-dir> --install
```
