# @justjs/transport

OSI Transport Layer — API adapters, caching, request handling.

Depends on @justjs/network. Provides ApiAdapter and CacheAdapter for higher-level data transport.

## Adapters

- **ApiAdapter** — HTTP API calls with request/response transformation
- **CacheAdapter** — In-memory request caching with TTL

## Usage

```typescript
import { ApiAdapter, CacheAdapter } from "@justjs/transport"

const api = new DefaultApiAdapter()
const cache = new DefaultCacheAdapter()

const response = await api.post("/api/users", { name: "Alice" })
const cached = await cache.get("users") || await api.get("/api/users")
```

## Stability

Second OSI layer — builds on network adapters to provide request/response handling.
