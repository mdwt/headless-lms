/**
 * Transport error type. The SDK call wrappers in `sdk.ts` throw this with the
 * HTTP status, so the global 401/403 handling (providers) and every hook keep
 * working uniformly.
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
