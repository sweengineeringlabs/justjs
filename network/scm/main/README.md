# @justjs/network

OSI Network Layer — raw browser APIs (fetch, WebSocket, Service Worker, Custom Elements).

Zero runtime dependencies. Provides adapters over native browser APIs.

## Adapters

- **FetchAdapter** — HTTP requests with abort, timeout, error handling
- **WsAdapter** — WebSocket connections with reconnect, health checks

## Usage

```typescript
import { FetchAdapter, WsAdapter } from "@justjs/network"

const fetch = new DefaultFetchAdapter()
const ws = new DefaultWsAdapter()

const response = await fetch.fetch("https://api.example.com/data")
const socket = ws.connect("wss://api.example.com/stream")
```

## Stability

Lowest OSI layer — provides raw browser API adapters with no higher-level abstractions.
