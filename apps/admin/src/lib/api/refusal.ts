import type { ApiError } from "./http";

export type Refusal = { refused: string; code?: string };

export const UNREACHABLE = "We couldn't reach the server. Try again in a moment.";

export function refusalOf(err: unknown): Refusal | null {
  const { status, code } = (err ?? {}) as Partial<ApiError>;
  if (!(err instanceof Error) || typeof status !== "number" || status < 400) {
    return null;
  }
  return { refused: err.message, ...(code && { code }) };
}

export async function refusable(run: () => Promise<void>): Promise<Refusal | null> {
  try {
    await run();
  } catch (err) {
    const refusal = refusalOf(err);
    if (refusal) return refusal;
    throw err;
  }
  return null;
}
