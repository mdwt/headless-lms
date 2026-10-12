import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '@headless-lms/core/shared/errors';
import { classifyError } from './errors.js';

describe('classifyError', () => {
  it('maps domain errors to status, code and message', () => {
    expect(classifyError(new NotFoundError('Course', 'crs_1'))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(classifyError(new ConflictError('taken'))).toEqual({
      status: 409,
      code: 'conflict',
      message: 'taken',
    });
  });
  it('passes through 4xx errors that carry a status code', () => {
    expect(
      classifyError(Object.assign(new Error('bad'), { statusCode: 400, code: 'FST_ERR' })),
    ).toEqual({ status: 400, code: 'FST_ERR', message: 'bad' });
  });
  it('returns null for unknown errors', () => {
    expect(classifyError(new Error('boom'))).toBeNull();
  });
});
