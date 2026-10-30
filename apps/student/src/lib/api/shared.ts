/**
 * Transport error type. The SDK is configured to throw this (see
 * `server-call.ts` and `client-sdk.ts`) instead of returning a result envelope,
 * so callers branch on the status — a 404 from a member read means "not enrolled
 * / not visible", which is a page state rather than a failure.
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

/** The HTTP status behind a thrown SDK error, or `undefined` for anything else. */
export function statusOf(e: unknown): number | undefined {
  return e instanceof ApiError ? e.status : undefined;
}

/**
 * The status of the failed response, or 500 when the request never got one
 * (network error, aborted fetch).
 */
export function responseStatus(response: Response | undefined): number {
  return response?.status ?? 500;
}

/**
 * What the API said went wrong. The SDK hands back the parsed response body,
 * which for this API is `{ error, message? }` — prefer that over the bare
 * status so the user sees the real reason.
 */
export function responseMessage(error: unknown, response: Response | undefined): string {
  const body = error as { message?: string; error?: string } | undefined;
  return (
    body?.message ?? body?.error ?? response?.statusText ?? `API error: ${responseStatus(response)}`
  );
}
