// Request-scoped log context. The HTTP layer enters a store per request and the
// root pino mixin folds it into every line logged inside that request — so
// lines emitted deep in adapters (e.g. a failed invite email inside better-auth
// callbacks) still carry the reqId/orgId of the request that triggered them.
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<Record<string, unknown>>();

export interface RequestLogContext {
  /** Runs `fn` with `fields` as the ambient log context for its async scope. */
  run<T>(fields: Record<string, unknown>, fn: () => T): T;
  /** Merges fields into the current request's context; noop outside a request. */
  set(fields: Record<string, unknown>): void;
  /** A copy of the current context ({} outside a request) — safe for pino's mutating mixin merge. */
  current(): Record<string, unknown>;
}

export const requestLogContext: RequestLogContext = {
  run(fields, fn) {
    return storage.run(fields, fn);
  },
  set(fields) {
    const store = storage.getStore();
    if (store) {
      Object.assign(store, fields);
    }
  },
  current() {
    return { ...storage.getStore() };
  },
};
