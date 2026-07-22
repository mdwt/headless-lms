import { describe, it, expect, vi } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleOutboxAppender, DrizzleOutboxStore, OUTBOX_MAX_ATTEMPTS } from './outbox.js';
import type { DbExecutor } from '../index.js';

function fakeTx() {
  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as DbExecutor, insert, values };
}

describe('DrizzleOutboxAppender', () => {
  it('inserts one row per event, mirroring type/orgId, with the event as payload', async () => {
    const { tx, values } = fakeTx();
    const events = [
      { type: 'entitlement.created' as const, orgId: 'org-1' },
      { type: 'connection.removed' as const, orgId: 'org-2' },
    ];
    await new DrizzleOutboxAppender(tx).append(events);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      type: 'entitlement.created',
      orgId: 'org-1',
      payload: events[0],
    });
    expect(rows[1]!['orgId']).toBe('org-2');
  });

  it('leaves id and createdAt to the column defaults', async () => {
    const { tx, values } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([{ type: 'entitlement.created', orgId: 'org-1' }]);
    const rows = values.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(rows[0]).not.toHaveProperty('id');
    expect(rows[0]).not.toHaveProperty('createdAt');
  });

  it('is a no-op for an empty event list', async () => {
    const { tx, insert } = fakeTx();
    await new DrizzleOutboxAppender(tx).append([]);
    expect(insert).not.toHaveBeenCalled();
  });
});

/** Thenable select-chain stub: every builder method returns itself; awaiting it
 *  resolves the given rows. */
function fakeSelectDb(rows: Array<Record<string, unknown>>) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'from', 'where', 'orderBy', 'limit', 'for']) {
    chain[method] = vi.fn(() => chain);
  }
  chain['then'] = (resolve: (value: unknown) => unknown) => resolve(rows);
  return {
    db: {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(chain)),
    } as unknown as NodePgDatabase,
    chain,
  };
}

describe('DrizzleOutboxStore', () => {
  it('caps retries: OUTBOX_MAX_ATTEMPTS is 10', () => {
    expect(OUTBOX_MAX_ATTEMPTS).toBe(10);
  });

  it('maps rows to messages: attempts alongside the payload, id/createdAt stamped in', async () => {
    const createdAt = new Date('2026-07-22T00:00:00.000Z');
    const { db } = fakeSelectDb([
      {
        id: 'evt_1',
        type: 'entitlement.created',
        orgId: 'org-1',
        payload: { type: 'entitlement.created', orgId: 'org-1' },
        attempts: 3,
        nextAttemptAt: createdAt,
        lastError: 'boom',
        createdAt,
        processedAt: null,
      },
    ]);
    const batch = await new DrizzleOutboxStore(db).fetchBatch(10);
    expect(batch).toEqual([
      {
        id: 'evt_1',
        attempts: 3,
        payload: {
          type: 'entitlement.created',
          orgId: 'org-1',
          id: 'evt_1',
          createdAt: '2026-07-22T00:00:00.000Z',
        },
      },
    ]);
  });

  it('markFailed increments attempts in SQL and records error + retry time', async () => {
    const where = vi.fn(async () => {});
    const set = vi.fn((_values: Record<string, unknown>) => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update } as unknown as NodePgDatabase;
    const nextAttemptAt = new Date('2026-07-22T12:00:05.000Z');
    await new DrizzleOutboxStore(db).markFailed('evt_1', 'boom', nextAttemptAt);
    const values = set.mock.calls[0]![0];
    expect(values['lastError']).toBe('boom');
    expect(values['nextAttemptAt']).toEqual(nextAttemptAt);
    // attempts must be a SQL increment (attempts + 1), not a JS-computed number —
    // a concurrent relay would otherwise clobber the counter.
    expect(typeof values['attempts']).toBe('object');
  });
});
