import type { ApiError } from "./http";

export type Refusal = { refused: string; code?: string };

export function refusalOf(err: unknown): Refusal | null {
  const { status, code } = (err ?? {}) as Partial<ApiError>;
  if (!(err instanceof Error) || typeof status !== "number" || status < 400 || status >= 500) {
    return null;
  }
  return { refused: err.message, ...(code && { code }) };
}
