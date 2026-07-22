// Cross-cutting domain errors. Like `../shared/ports.js`, this file is
// importable from any context; the central HTTP error handler maps these to
// status codes so routes never hand-roll error replies.

/** A command's target does not exist in this org. Queries return null for the
 *  same situation — a missing row is a normal answer to a question, but a
 *  failed precondition for a command. */
export class NotFoundError extends Error {
  constructor(
    readonly resource: string,
    readonly id: string,
  ) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/** A command conflicts with existing state (duplicate email, already linked,
 *  …). The HTTP layer maps this to 409. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
