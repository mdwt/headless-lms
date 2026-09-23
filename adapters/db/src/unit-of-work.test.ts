import { describe, it, expect, vi } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConflictError } from '@headless-lms/core/shared/errors';
import { DrizzleUnitOfWork } from './unit-of-work.js';
import { DbQueryError } from './repositories/pg-errors.js';
import { DrizzleOutboxAppender } from './repositories/outbox.js';
import type { Tx } from './client.js';

function fakeDb() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  const tx = { insert } as unknown as Tx;
  const transaction = vi.fn(async <T>(fn: (t: Tx) => Promise<T>) => fn(tx));
  return { db: { transaction } as unknown as NodePgDatabase, tx, transaction, insert };
}

describe('DrizzleUnitOfWork', () => {
  it('runs the callback inside db.transaction with the tx-bound scope', async () => {
    const { db, tx, transaction } = fakeDb();
    const makeScope = vi.fn((executor: Tx) => ({ marker: executor }));
    const uow = new DrizzleUnitOfWork(db, makeScope);
    const result = await uow.run(async (scope) => {
      expect(scope.marker).toBe(tx);
      return 'done';
    });
    expect(result).toBe('done');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(makeScope).toHaveBeenCalledWith(tx);
  });

  it('binds an outbox appender in the scope to the SAME transaction executor', async () => {
    const { db, insert } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, (tx) => ({ outbox: new DrizzleOutboxAppender(tx) }));
    await uow.run(async ({ outbox }) => {
      await outbox.append([
        { type: 'entitlement.created', version: 1, orgId: 'org-1', data: {} },
      ]);
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('propagates a thrown error out of run (drizzle rolls the tx back)', async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    await expect(
      uow.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('translates a unique violation (23505) into ConflictError', async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    const drizzleError = Object.assign(new Error('Failed query: insert ...'), {
      query: 'insert into "organizations" ...',
      params: ['org_1'],
      cause: Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'organizations_slug_unique',
        detail: 'Key (slug)=(orgie) already exists.',
      }),
    });
    const rejection = expect(
      uow.run(async () => {
        throw drizzleError;
      }),
    ).rejects;
    await rejection.toBeInstanceOf(ConflictError);
    await rejection.toThrow('slug "orgie" is already in use');
  });

  it('keeps a foreign key violation (23503) internal instead of a ConflictError', async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    const drizzleError = Object.assign(new Error('Failed query: insert ...\nparams: owner-1'), {
      query: 'insert into "organizations" ...',
      params: ['owner-1'],
      cause: Object.assign(new Error('violates foreign key constraint'), {
        code: '23503',
        constraint: 'organizations_owner_id_users_id_fk',
      }),
    });
    const thrown = await uow
      .run(async () => {
        throw drizzleError;
      })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(thrown).toBeInstanceOf(DbQueryError);
    expect(thrown).not.toBeInstanceOf(ConflictError);
    const dbError = thrown as DbQueryError;
    expect(dbError.message).toBe('violates foreign key constraint');
    expect(dbError.message).not.toContain('owner-1');
    expect(dbError.pg).toEqual({
      code: '23503',
      constraint: 'organizations_owner_id_users_id_fk',
    });
  });

  it('sanitizes other query failures: driver message and pg fields, no bind params', async () => {
    const { db } = fakeDb();
    const uow = new DrizzleUnitOfWork(db, () => ({}));
    const drizzleError = Object.assign(
      new Error('Failed query: select ...\nparams: secret@example.com'),
      {
        query: 'select * from "users" where email = $1',
        params: ['secret@example.com'],
        cause: Object.assign(new Error('invalid input syntax'), { code: '22P02' }),
      },
    );
    const thrown = await uow
      .run(async () => {
        throw drizzleError;
      })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(thrown).toBeInstanceOf(DbQueryError);
    const dbError = thrown as DbQueryError;
    expect(dbError.message).toBe('invalid input syntax');
    expect(dbError.query).toBe('select * from "users" where email = $1');
    expect(dbError.pg).toEqual({ code: '22P02' });
    expect(JSON.stringify({ ...dbError, message: dbError.message })).not.toContain(
      'secret@example.com',
    );
  });
});
