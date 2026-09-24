// AUTO-GENERATED — do not edit. Regenerate with: justw generate app
//
// Shared HTTP client + mock interception. Standards-only: fetch() + Map +
// Response. Works in any modern browser, Node >= 18, Deno, or Bun.

export type HttpResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/**
 * Single entrypoint for every generated `_api.gen.ts` endpoint.
 * Wraps fetch(), shapes the response into HttpResult, and routes through
 * any mock handlers registered via `registerMock`.
 */
export async function apiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResult<T>> {
  const init: RequestInit = {
    method,
    headers: { "Accept": "application/json" },
  };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  try {
    const r = await fetch(path, init);
    if (!r.ok) {
      return {
        ok: false,
        error: { code: `HTTP_${r.status}`, message: r.statusText || "request failed" },
      };
    }
    const contentType = r.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await r.json() as T
      : (await r.text()) as unknown as T;
    return { ok: true, data };
  } catch (e) {
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: String(e) },
    };
  }
}

// ── Mock interception ──────────────────────────────────────────────────

const __mocks = new Map<string, () => unknown>();

/**
 * Register a handler for `${method} ${path}`. Call before any fetch()
 * that should be intercepted. Each path-method pair gets one handler;
 * re-registering replaces.
 */
export function registerMock(
  method: string,
  path: string,
  handler: () => unknown,
): void {
  __mocks.set(`${method.toUpperCase()} ${path}`, handler);
}

/**
 * Install the mock interceptor on `globalThis.fetch`. Idempotent — call
 * once at app startup. After this, any registered mock intercepts the
 * matching fetch and returns its handler's value as JSON.
 */
export function installMocks(): void {
  if ((globalThis as { __justwebMocksInstalled?: boolean }).__justwebMocksInstalled) return;
  (globalThis as { __justwebMocksInstalled?: boolean }).__justwebMocksInstalled = true;

  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const path = new URL(url, globalThis.location?.href ?? "http://localhost/").pathname;

    const mock = __mocks.get(`${method} ${path}`);
    if (mock !== undefined) {
      return new Response(JSON.stringify(mock()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(input, init);
  };
}
