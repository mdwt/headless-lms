import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerErrorHandler } from './error-handler.js';
import { NotFoundError } from '../../core/shared/errors.js';
import { OrganizationRuleError } from '../../core/organizations/index.js';
import {
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from '../../core/integrations/index.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  registerErrorHandler(app);
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
  it('maps NotFoundError to 404 not_found', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-found' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Course not found' });
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
});
