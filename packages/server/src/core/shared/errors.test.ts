import { describe, it, expect } from 'vitest';
import { NotFoundError } from './errors.js';

describe('NotFoundError', () => {
  it('carries the resource and id and formats the message', () => {
    const err = new NotFoundError('Course', 'c1');

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NotFoundError');
    expect(err.resource).toBe('Course');
    expect(err.id).toBe('c1');
    expect(err.message).toBe('Course not found');
  });
});
