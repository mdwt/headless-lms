import { ConflictError } from "@headless-lms/core/shared/errors";

/**
 * Structured fields off a node-postgres DatabaseError. The driver (and
 * drizzle's DrizzleQueryError) sometimes wraps the original error behind
 * `cause`, so both levels are checked.
 */
export type PgErrorFields = {
  code: string;
  constraint?: string;
  table?: string;
  column?: string;
  detail?: string;
};

const PG_CODE = /^[0-9A-Z]{5}$/;

export function pgErrorFields(err: unknown): PgErrorFields | undefined {
  for (const level of [err, (err as { cause?: unknown } | undefined)?.cause]) {
    const e = level as Partial<PgErrorFields> | undefined;
    if (typeof e?.code === "string" && PG_CODE.test(e.code)) {
      return {
        code: e.code,
        ...(typeof e.constraint === "string" && { constraint: e.constraint }),
        ...(typeof e.table === "string" && { table: e.table }),
        ...(typeof e.column === "string" && { column: e.column }),
        ...(typeof e.detail === "string" && { detail: e.detail }),
      };
    }
  }
  return undefined;
}

/** Postgres unique_violation (23505). */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorFields(err)?.code === "23505";
}

/**
 * A database failure sanitized for logging: the driver's message, the SQL
 * text, and the structured pg fields — never the bind params, which a
 * DrizzleQueryError embeds in its message and can carry PII.
 */
export class DbQueryError extends Error {
  readonly pg?: PgErrorFields;
  readonly query?: string;

  constructor(message: string, opts: { pg?: PgErrorFields; query?: string; cause?: Error }) {
    super(message, opts.cause && { cause: opts.cause });
    this.name = "DbQueryError";
    if (opts.pg) {
      this.pg = opts.pg;
    }
    if (opts.query) {
      this.query = opts.query;
    }
  }
}

/**
 * What the unit of work rethrows: constraint violations become domain
 * ConflictErrors, other query failures become sanitized DbQueryErrors, and
 * anything non-database passes through untouched.
 */
export function translateDbError(err: unknown): unknown {
  if (err instanceof ConflictError || err instanceof DbQueryError) {
    return err;
  }
  const conflict = translateConstraintViolation(err);
  if (conflict) {
    return conflict;
  }
  const e = err as { query?: unknown; params?: unknown; cause?: unknown; message?: unknown };
  if (typeof e?.query === "string" && Array.isArray(e.params)) {
    const cause = e.cause instanceof Error ? e.cause : undefined;
    const pg = pgErrorFields(err);
    return new DbQueryError(cause?.message ?? "database query failed", {
      ...(cause && { cause }),
      query: e.query,
      ...(pg && { pg }),
    });
  }
  return err;
}

/**
 * Route every method of a repository class through translateDbError, so no
 * drizzle or pg error ever leaves this package — regardless of whether the
 * call runs inside a unit of work. Applied once per class, right below its
 * declaration.
 */
export function translateDbErrors(cls: { prototype: object }): void {
  const proto = cls.prototype as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (name === "constructor") {
      continue;
    }
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc || typeof desc.value !== "function") {
      continue;
    }
    const original = desc.value as (...args: unknown[]) => unknown;
    proto[name] = function (this: unknown, ...args: unknown[]) {
      let result: unknown;
      try {
        result = original.apply(this, args);
      } catch (err) {
        throw translateDbError(err);
      }
      if (result instanceof Promise) {
        return result.catch((err: unknown) => {
          throw translateDbError(err);
        });
      }
      return result;
    };
  }
}

/** `Key (slug)=(orgie) already exists.` → ['slug', 'orgie'] */
const KEY_DETAIL = /^Key \((.+?)\)=\((.+?)\)/;

/**
 * Only unique violations (23505) become ConflictErrors: a duplicate is the
 * one constraint failure the caller can act on, so it earns a 409 with a
 * client-facing message — the offending column and the caller's own value,
 * never pg's `detail`. Every other constraint failure (foreign keys
 * included) is a server-side integrity problem: it stays an internal error,
 * sanitized by translateDbError and logged, and the client sees a generic
 * 500. The raw error stays on `cause` for server-side logs.
 */
export function translateConstraintViolation(err: unknown): ConflictError | undefined {
  const pg = pgErrorFields(err);
  if (pg?.code !== "23505") {
    return undefined;
  }
  const key = pg.detail?.match(KEY_DETAIL);
  const conflict = new ConflictError(
    key ? `${key[1]} "${key[2]}" is already in use` : "This value is already in use",
  );
  return Object.assign(conflict, { cause: err });
}
