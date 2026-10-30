import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '@headless-lms/core/shared/errors';
import { classifyError } from './errors.js';

describe('classifyError', () => {
  it('maps domain errors to status, code and message', () => {
    expect(classifyError(new NotFoundError('Course', 'crs_1'))).toMatchObject({
      status: 404,
      error: 'not_found',
    });
    expect(classifyError(new ConflictError('taken'))).toEqual({
      status: 409,
      error: 'conflict',
      message: 'taken',
    });
  });
  it('answers other 4xx errors without echoing their message', () => {
    expect(
      classifyError(Object.assign(new Error('bad'), { statusCode: 400, code: 'FST_ERR' })),
    ).toEqual({ status: 400, error: 'bad_request', message: 'The request could not be processed' });
  });
  it('returns nothing for unknown errors', () => {
    expect(classifyError(new Error('boom'))).toBeUndefined();
  });
});
