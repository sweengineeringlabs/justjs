# hello-justjs — Data Flow Demo

A minimal demo app showing **data traveling through JustJS's 4 OSI layers** and **AOP aspects** in real-time.

## What You'll See

**Real DOM mutations** as data flows through:

1. **Network Layer** — HTTP requests to external APIs
2. **Transport Layer** — Parsing and serialization
3. **Application Layer** — Event handling and routing
4. **Data Layer** — State management and subscribers

**Observability panel** at the bottom logs every data transition.

## Run It

```bash
cd scm/examples/hello-justjs
bun install
bun run dev
```

Opens at `http://localhost:3000`

## Components

### Counter Component
- **User Action:** Click `+`/`−` buttons
- **Data Flow:** User click → Application layer logs action → Data layer increments state → Component re-renders with new DOM
- **Trace:** Watch the log panel show `Application → Data → Application`

### Fetch Data Component
- **User Action:** Click "Fetch Random User"
- **Data Flow:**
  1. **Network layer** — HTTP GET to jsonplaceholder.typicode.com
  2. **Transport layer** — Parse JSON response
  3. **Application layer** — Process the data
  4. **Data layer** — Store in state
  5. Component re-renders with fetched user info
- **Trace:** Watch all 4 layers in the log panel: `Network → Transport → Application → Data → (re-render)`

## What Gets Logged

Each log entry shows:
- **Layer** — which OSI layer is active (Network, Transport, Application, Data)
- **Direction** — `→` (into layer) or `←` (out of layer)
- **Data** — what's being passed
- **Aspect** — which AOP aspect is weaving (future: security, observability, i18n, etc.)

## Verifies

✓ **Real DOM mutations** — HTML actually changes as state updates
✓ **Data traceability** — Each transformation is logged
✓ **4 OSI layers** — All layers active and observable
✓ **Component lifecycle** — Components mount/unmount correctly
✓ **State subscribers** — Multiple listeners react to state changes
✓ **Async operations** — Network requests handled end-to-end

## Architecture

```
index.html
  ├── src/core/app.js (entry, routing)
  ├── src/core/state.js (data layer, state store)
  ├── src/core/observability.js (logging every layer transition)
  ├── src/components/counter.js (x-counter custom element)
  └── src/components/fetch-demo.js (x-fetch custom element)
```

- **Counter**: Simple local state mutation
- **Fetch**: Full async flow through all 4 layers
- **Observability**: Live log of every data transition

## Next Steps

This demo can be extended to verify:
- Real-time metrics/tracing (task #21)
- Security aspect (validating inputs, sanitizing)
- i18n aspect (translating UI dynamically)
- Feature flags aspect (toggling components on/off)
- Memory cleanup (verifying no listener leaks)
