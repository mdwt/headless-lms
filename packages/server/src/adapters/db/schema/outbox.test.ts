import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { eventOutbox } from './outbox.js';

describe('event_outbox schema', () => {
  const config = getTableConfig(eventOutbox);

  it('is the event_outbox table with the queue columns', () => {
    expect(config.name).toBe('event_outbox');
    expect(config.columns.map((c) => c.name).sort()).toEqual([
      'attempts',
      'created_at',
      'id',
      'last_error',
      'next_attempt_at',
      'org_id',
      'payload',
      'processed_at',
      'type',
    ]);
  });

  it('requires org_id — every event is tenant-scoped', () => {
    expect(config.columns.find((c) => c.name === 'org_id')?.notNull).toBe(true);
  });

  it('leaves id and created_at to column defaults', () => {
    const id = config.columns.find((c) => c.name === 'id');
    const createdAt = config.columns.find((c) => c.name === 'created_at');
    expect(id?.hasDefault).toBe(true);
    expect(createdAt?.hasDefault).toBe(true);
  });

  it('defaults attempts to 0 and next_attempt_at to now — new rows are immediately due', () => {
    const attempts = config.columns.find((c) => c.name === 'attempts');
    const nextAttemptAt = config.columns.find((c) => c.name === 'next_attempt_at');
    expect(attempts?.notNull).toBe(true);
    expect(attempts?.hasDefault).toBe(true);
    expect(nextAttemptAt?.notNull).toBe(true);
    expect(nextAttemptAt?.hasDefault).toBe(true);
  });

  it('keeps last_error nullable — never-failed rows have no error', () => {
    const lastError = config.columns.find((c) => c.name === 'last_error');
    expect(lastError?.notNull).toBe(false);
  });

  it('declares the partial pending index', () => {
    expect(config.indexes).toHaveLength(1);
    expect(config.indexes[0]?.config.name).toBe('event_outbox_pending_idx');
  });
});
