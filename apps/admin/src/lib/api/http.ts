/**
 * Transport primitives shared by the mock backend and the typed client.
 *
 * When wiring the real REST API, only `client.ts` changes — it stops calling
 * the mock and calls `fetch` instead, still throwing `ApiError` so the global
 * 401/403 handling and every hook keep working unchanged.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Simulated network latency window (ms) for the mock backend. */
export function latency(min = 280, max = 620): Promise<void> {
  // Deterministic-ish jitter without Math.random (SSR-safe at module load).
  const span = max - min;
  const jitter = (Date.now() % span + span) % span;
  return new Promise((r) => setTimeout(r, min + jitter));
}

/** Auth token accessor — centralized so every request carries it. */
let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/** Build the headers every real request would send (used by the swap target). */
export function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}
