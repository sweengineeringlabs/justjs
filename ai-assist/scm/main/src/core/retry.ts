import type { ApiResponse } from "@justjs/transport";

const DEFAULT_RETRY_DELAY_MS = 2000;
const MS_PER_SECOND = 1000;
const RATE_LIMITED_STATUS = 429;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Anthropic sends Retry-After as delta-seconds on a 429, not an HTTP-date
// - only that form is parsed here. Falls back to DEFAULT_RETRY_DELAY_MS
// for a missing or unparseable header. `seconds * MS_PER_SECOND` is a
// single binary op, deliberately not a parenthesized subexpression
// followed by another operator - justc (0.3.5, verified on real
// hardware in @justjs/memory's own fake_embedding.ts and
// default_memory_provider.ts) has a confirmed bug silently dropping
// parens in exactly that shape, corrupting evaluation order.
function retryDelayMs(headers: Record<string, string>): number {
  const raw = headers["retry-after"];
  if (!raw) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_RETRY_DELAY_MS;
  }
  return seconds * MS_PER_SECOND;
}

// Single retry on a 429 only - a 4xx validation error or 5xx server
// error retried blindly would just repeat the same failure, and there's
// no streaming safety net here to show progress while it does. No
// retry/backoff helper exists anywhere else in this codebase (checked);
// this is intentionally minimal, not a general-purpose retry policy.
export async function withSingleRetryOn429<T>(
  call: () => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  const first = await call();
  if (first.status !== RATE_LIMITED_STATUS) {
    return first;
  }
  await sleep(retryDelayMs(first.headers));
  return call();
}
