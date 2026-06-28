// Shared contract primitives reused across resource contracts.
import { z } from "zod";

/** Uniform error envelope returned by every non-2xx response. */
export const ErrorBody = z.object({
  error: z.string(),
  message: z.string().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/**
 * Common list query for page-based collections. `z.coerce` because query-string
 * values arrive as strings; defaults make the params optional for callers.
 */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  /** Sort field, optionally prefixed with `-` for descending (e.g. `-updatedAt`). */
  sort: z.string().optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;

/** Wrap a row schema into the standard paginated envelope. */
export function paginated<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    rows: z.array(row),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}
