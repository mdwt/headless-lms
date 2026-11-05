import { describe, it, expect } from 'vitest';
import { noopLogger, createCapturingLogger, describeError } from './logger.js';

describe('noopLogger', () => {
  it('swallows every level and returns itself from child()', () => {
    expect(() => {
      noopLogger.debug('d');
      noopLogger.info('i', { a: 1 });
      noopLogger.warn('w');
      noopLogger.error('e', { err: new Error('x') });
    }).not.toThrow();
    expect(noopLogger.child({ name: 'content' })).toBe(noopLogger);
  });
});

describe('createCapturingLogger', () => {
  it('records level, message, and meta', () => {
    const { logger, entries } = createCapturingLogger();
    logger.info('course created', { courseId: 'c1' });
    logger.warn('odd');
    expect(entries).toEqual([
      { level: 'info', msg: 'course created', meta: { courseId: 'c1' } },
      { level: 'warn', msg: 'odd', meta: {} },
    ]);
  });

  it('merges child bindings into meta, call-site meta winning', () => {
    const { logger, entries } = createCapturingLogger();
    const child = logger.child({ name: 'content' });
    child.debug('x', { n: 1 });
    child.child({ name: 'override', deep: true }).error('y', { deep: false });
    expect(entries).toEqual([
      { level: 'debug', msg: 'x', meta: { name: 'content', n: 1 } },
      { level: 'error', msg: 'y', meta: { name: 'override', deep: false } },
    ]);
  });
});

describe('describeError', () => {
  it('names each distinct inner error of an AggregateError, whose own message is empty', () => {
    const refused = (address: string) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}`), { code: 'ECONNREFUSED' });
    const err = new AggregateError([refused('::1:5432'), refused('127.0.0.1:5432')]);
    expect(err.message).toBe('');
    expect(describeError(err)).toBe(
      'connect ECONNREFUSED ::1:5432; connect ECONNREFUSED 127.0.0.1:5432',
    );
  });

  it('adds the code when the message does not carry it', () => {
    expect(describeError(Object.assign(new Error('read failed'), { code: 'ECONNRESET' }))).toBe(
      'ECONNRESET: read failed',
    );
  });

  it('falls back to the name for an error without a message, and to String otherwise', () => {
    expect(describeError(new TypeError())).toBe('TypeError');
    expect(describeError('boom')).toBe('boom');
  });
});
