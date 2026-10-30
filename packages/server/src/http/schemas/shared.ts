// Shared contract primitives reused across resource contracts.
import { z } from 'zod';

/** Fails typecheck when a schema and its domain type drift apart. */
export type Matches<A, _B extends A> = true;

/** Uniform error envelope returned by every non-2xx response. */
export const ErrorBody = z.object({
  error: z.string(),
  message: z.string().optional(),
  /** Server-side correlation id — quote it to find the matching API log line. */
  requestId: z.string().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** A 400 from request validation: `message` names the first problem, `issues` lists them all. */
export const ValidationErrorBody = ErrorBody.extend({
  issues: z
    .array(
      z.object({
        path: z.string().describe('Where in the request, such as `body.topics[1].name`'),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ValidationErrorBody = z.infer<typeof ValidationErrorBody>;

type RefusalStatus = 400 | 403 | 404 | 409 | 413 | 415 | 502;
type RefusalBodies<S extends RefusalStatus> = {
  [K in S]: K extends 400 ? typeof ValidationErrorBody : typeof ErrorBody;
};

/** Response schemas for the refusals a route can answer. A 400 keeps the validation `issues`. */
export function refusals<S extends RefusalStatus>(...statuses: S[]): RefusalBodies<S> {
  return Object.fromEntries(
    statuses.map((status) => [status, status === 400 ? ValidationErrorBody : ErrorBody]),
  ) as RefusalBodies<S>;
}

/** An RFC 3339 date-time in a request, such as `2026-10-29T12:00:00Z`, read as a Date. */
export const DateTimeInput = z.iso.datetime({ offset: true }).pipe(z.coerce.date());

/** Page position only, for lists that take no search or sort. */
export const PageQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type PageQuery = z.infer<typeof PageQuery>;

/**
 * Common list query for page-based collections. `z.coerce` because query-string
 * values arrive as strings; defaults make the params optional for callers.
 */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
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

/** All four org roles. `members.ts` exports a staff-only three-value `Role`;
 *  this is the full set, used wherever a learner can also appear. */
export const OrgRole = z.enum(['owner', 'admin', 'instructor', 'moderator', 'student']);
export type OrgRole = z.infer<typeof OrgRole>;

/** Mirrors UserProfile in @headless-lms/core/types — keyed on the auth user id. */
export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});
export type UserProfileSchema = z.infer<typeof UserProfileSchema>;

/** Mirrors OrgUserProfile in @headless-lms/core/types — keyed on org_users.id. */
export const OrgUserProfileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
});
export type OrgUserProfileSchema = z.infer<typeof OrgUserProfileSchema>;
