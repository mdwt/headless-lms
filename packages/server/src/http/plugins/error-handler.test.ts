import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { NotFoundError, ConflictError } from '@headless-lms/core/shared/errors';
import { OrganizationRuleError } from '@headless-lms/core/organizations';
import {
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from '@headless-lms/core/integrations';
import { AutomationKindMismatchError, ReservedActionError } from '@headless-lms/core/automations';
import { errorHandler } from './error-handler.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.setErrorHandler(errorHandler);
  const throwers: Record<string, () => never> = {
    'not-found': () => {
      throw new NotFoundError('Course', 'c1');
    },
    'org-rule': () => {
      throw new OrganizationRuleError('cannot demote the last owner');
    },
    'already-connected': () => {
      throw new AlreadyConnectedError('slack');
    },
    'unknown-integration': () => {
      throw new UnknownIntegrationError('nope');
    },
    'invalid-config': () => {
      throw new InvalidConfigError('slack', ['channel is required']);
    },
    conflict: () => {
      throw new ConflictError('A student with this email already exists');
    },
    'reserved-action': () => {
      throw new ReservedActionError('deliverWebhook');
    },
    'kind-mismatch': () => {
      throw new AutomationKindMismatchError('atm_1', 'webhook');
    },
    unhandled: () => {
      throw new Error('boom');
    },
  };
  for (const [path, thrower] of Object.entries(throwers)) {
    app.get(`/${path}`, thrower);
  }
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('central error handler', () => {
  it('maps ReservedActionError to 400 reserved_action', async () => {
    const res = await app.inject({ method: 'GET', url: '/reserved-action' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'reserved_action',
      message: 'action "deliverWebhook" is reserved to webhooks',
    });
  });

  it('maps AutomationKindMismatchError to 409 kind_mismatch', async () => {
    const res = await app.inject({ method: 'GET', url: '/kind-mismatch' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'kind_mismatch',
      message: 'automation "atm_1" is a webhook and can\'t be changed through this operation',
    });
  });

  it('maps NotFoundError to 404 not_found', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-found' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Course not found' });
  });

  it('maps ConflictError to 409 conflict', async () => {
    const res = await app.inject({ method: 'GET', url: '/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      error: 'conflict',
      message: 'A student with this email already exists',
    });
  });

  it('maps OrganizationRuleError to 409 conflict', async () => {
    const res = await app.inject({ method: 'GET', url: '/org-rule' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'conflict', message: 'cannot demote the last owner' });
  });

  it('maps AlreadyConnectedError to 409 already_connected', async () => {
    const res = await app.inject({ method: 'GET', url: '/already-connected' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'already_connected' });
  });

  it('maps UnknownIntegrationError to 400 unknown_integration', async () => {
    const res = await app.inject({ method: 'GET', url: '/unknown-integration' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'unknown_integration' });
  });

  it('maps InvalidConfigError to 400 invalid_config', async () => {
    const res = await app.inject({ method: 'GET', url: '/invalid-config' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_config' });
  });

  it('returns 500 internal_error with the request id for unhandled errors', async () => {
    const res = await app.inject({ method: 'GET', url: '/unhandled' });
    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error).toBe('internal_error');
    expect(body.requestId).toBeTypeOf('string');
  });
});
