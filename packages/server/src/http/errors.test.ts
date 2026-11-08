import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  UnavailableError,
  ValidationError,
} from '@headless-lms/core/shared/errors';
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
    expect(classifyError(new ConflictError('The event is canceled', 'canceled'))).toEqual({
      status: 409,
      error: 'canceled',
      message: 'The event is canceled',
    });
  });
  it('carries the details of an unavailable refusal', () => {
    expect(classifyError(new UnavailableError('later', { postId: 'pst_1' }))).toEqual({
      status: 503,
      error: 'unavailable',
      message: 'later',
      details: { postId: 'pst_1' },
    });
    expect(classifyError(new UnavailableError('later'))).toEqual({
      status: 503,
      error: 'unavailable',
      message: 'later',
    });
  });
  it('names the body field of each validation problem, and the body when a problem has none', () => {
    expect(
      classifyError(
        new ValidationError([
          { path: 'categories[3].covers', message: 'earlier categories already cover it' },
          { message: 'the list is refused' },
        ]),
      ),
    ).toEqual({
      status: 422,
      error: 'unprocessable',
      message: 'categories[3].covers: earlier categories already cover it; the list is refused',
      issues: [
        { path: 'body.categories[3].covers', message: 'earlier categories already cover it' },
        { path: 'body', message: 'the list is refused' },
      ],
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
