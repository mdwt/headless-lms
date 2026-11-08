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
  it('says a missing field is required and keeps a pattern’s own message', () => {
    const issue = (instancePath: string, keyword: string, message: string, params: object) => ({
      [Symbol.for('ZodFastifySchemaValidationError')]: true,
      keyword,
      instancePath,
      schemaPath: `#${instancePath}/${keyword}`,
      message,
      params,
    });
    const error = Object.assign(new Error('invalid'), {
      validationContext: 'body',
      validation: [
        issue('/title', 'invalid_type', 'Invalid input: expected string, received undefined', {
          expected: 'string',
        }),
        issue('/country', 'invalid_format', 'must be an ISO 3166-1 alpha-2 code', {
          format: 'regex',
          pattern: '/^[A-Z]{2}$/',
        }),
        issue('/url', 'invalid_format', 'Invalid URL', { format: 'url' }),
        issue('/capacity', 'invalid_type', 'Invalid input: expected number, received string', {
          expected: 'number',
        }),
      ],
    });
    expect(classifyError(error)?.issues).toEqual([
      { path: 'body.title', message: 'is required' },
      { path: 'body.country', message: 'must be an ISO 3166-1 alpha-2 code' },
      { path: 'body.url', message: 'must be a valid url' },
      { path: 'body.capacity', message: 'must be a number' },
    ]);
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
