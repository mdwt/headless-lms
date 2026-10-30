import type { ApiError } from "@/lib/api/http";

export type SaveRefusal = { refused: string };

export function saveRefusal(err: unknown): SaveRefusal | null {
  const status = (err as Partial<ApiError> | null)?.status;
  return status === 409 && err instanceof Error ? { refused: err.message } : null;
}
