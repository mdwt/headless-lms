import { describe, it, expect, vi } from 'vitest';
import { IntegrationsServiceImpl } from './service.js';
import { createIntegrationsRegistry } from './registry.js';
import { AlreadyConnectedError, InvalidConfigError, UnknownIntegrationError } from './model.js';
import type { Connection } from './model.js';
import type { ConnectionsRepository, Integration, IntegrationsUnitOfWork } from './ports.js';
import type { CredentialStore, NewDomainEvent } from '../shared/ports.js';

// Inline integrations — the real ones (adapters/integrations/*) are adapter
// concerns; the core service only needs modules satisfying the port.
const stripe: Integration = {
  id: 'stripe',
  configSchema: () => ({ type: 'object', properties: { mode: { enum: ['live', 'test'] } } }),
  secretsSchema: () => ({ type: 'object', required: ['apiKey'] }),
  actions: [],
  validateConfig: (config) => {
    const mode = (config as Record<string, unknown>)?.mode;
    return mode === undefined || mode === 'live' || mode === 'test'
      ? { ok: true }
      : { ok: false, errors: ['mode: invalid'] };
  },
};
const slack: Integration = {
  id: 'slack',
  configSchema: () => ({ type: 'object' }),
  secretsSchema: () => ({ type: 'object', required: ['botToken'] }),
  validateConfig: () => ({ ok: true }),
  actions: [
    {
      id: 'postMessageToChannel',
      description: 'Post a message to a channel.',
      inputSchema: () => ({ type: 'object' }),
      outputSchema: () => ({ type: 'object' }),
      invoke: async () => ({}),
    },
  ],
};

const SAMPLE: Connection = {
  id: 'con_1',
  integrationId: 'stripe',
  config: { mode: 'test' },
  active: true,
  credentialRef: 'crd_1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const registry = createIntegrationsRegistry([stripe, slack]);

function fakeRepo(over?: Partial<ConnectionsRepository>): ConnectionsRepository {
  return {
    insert: vi.fn().mockImplementation((_org, c) => Promise.resolve(c)),
    findById: vi.fn().mockResolvedValue(SAMPLE),
    findByIntegration: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([SAMPLE]),
    update: vi.fn().mockResolvedValue(SAMPLE),
    delete: vi.fn().mockResolvedValue(true),
    ...over,
  };
}

function fakeCredentials(over?: Partial<CredentialStore>): CredentialStore {
  return {
    store: vi.fn().mockResolvedValue('crd_1'),
    reveal: vi.fn().mockResolvedValue({ apiKey: 'sk_live_x' }),
    update: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

/** Pass-through unit of work over the same fakes the service reads with —
 *  the scope's tx-bound repos ARE the fakes, plus a capturing appender. */
function build(repo = fakeRepo(), credentials = fakeCredentials()) {
  const appended: NewDomainEvent[] = [];
  const append = vi.fn(async (events: NewDomainEvent[]) => {
    appended.push(...events);
  });
  const uow: IntegrationsUnitOfWork = {
    run: (fn) => fn({ connections: repo, credentials, outbox: { append } }),
  };
  const svc = new IntegrationsServiceImpl(registry, repo, uow, () => '2026-01-02T00:00:00Z');
  return { svc, repo, credentials, append, appended };
}

describe('IntegrationsRegistry', () => {
  it('resolves declared integrations and rejects duplicates', () => {
    expect(registry.get('stripe')?.id).toBe('stripe');
    expect(registry.get('strope')).toBeNull();
    expect(registry.list().map((i) => i.id)).toEqual(['stripe', 'slack']);
    expect(() => createIntegrationsRegistry([stripe, stripe])).toThrow(/duplicate/);
  });
});

describe('IntegrationsService', () => {
  it("available exposes each declared integration's id, config schema, and actions", () => {
    const { svc } = build();
    const available = svc.available();
    expect(available.map((a) => a.id)).toEqual(['stripe', 'slack']);
    expect(available[0]?.configSchema).toHaveProperty('type', 'object');
    expect(available[0]?.secretsSchema).toHaveProperty('required', ['apiKey']);
    expect(available[0]?.actions).toEqual([]);
    expect(available[1]?.actions).toEqual([
      {
        id: 'postMessageToChannel',
        description: 'Post a message to a channel.',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    ]);
  });

  it('connect stores the credential, inserts the connection, appends created — one scope', async () => {
    const { svc, repo, credentials, appended } = build();
    const conn = await svc.connect('org-1', {
      integrationId: 'stripe',
      secrets: { apiKey: 'sk_live_x' },
      config: { mode: 'live' },
    });
    expect(credentials.store).toHaveBeenCalledWith('org-1', { apiKey: 'sk_live_x' });
    expect(conn.credentialRef).toBe('crd_1');
    expect(conn.active).toBe(true);
    expect(repo.insert).toHaveBeenCalled();
    expect(appended).toEqual([
      expect.objectContaining({
        type: 'connection.created',
        orgId: 'org-1',
        integrationId: 'stripe',
      }),
    ]);
  });

  it('connect rejects an undeclared integration id', async () => {
    const { svc, credentials } = build();
    await expect(
      svc.connect('org-1', { integrationId: 'strope', secrets: { apiKey: 'x' } }),
    ).rejects.toThrow(UnknownIntegrationError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it("connect rejects config the integration's validator refuses", async () => {
    const { svc, credentials } = build();
    await expect(
      svc.connect('org-1', {
        integrationId: 'stripe',
        secrets: { apiKey: 'x' },
        config: { mode: 'sandbox' },
      }),
    ).rejects.toThrow(InvalidConfigError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it('connect rejects a second connection for the same integration', async () => {
    const { svc, credentials } = build(
      fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) }),
    );
    await expect(
      svc.connect('org-1', { integrationId: 'stripe', secrets: { apiKey: 'x' } }),
    ).rejects.toThrow(AlreadyConnectedError);
    expect(credentials.store).not.toHaveBeenCalled();
  });

  it('connect appends nothing when the credential write fails (atomic scope aborts)', async () => {
    const { svc, repo, append } = build(
      fakeRepo(),
      fakeCredentials({ store: vi.fn().mockRejectedValue(new Error('crypto down')) }),
    );
    await expect(
      svc.connect('org-1', { integrationId: 'stripe', secrets: { apiKey: 'x' } }),
    ).rejects.toThrow('crypto down');
    expect(repo.insert).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it('reconnect replaces the secrets in place (same ref), appends updated', async () => {
    const { svc, credentials, appended } = build();
    await svc.reconnect('org-1', 'con_1', { apiKey: 'sk_live_new' });
    expect(credentials.update).toHaveBeenCalledWith('org-1', 'crd_1', { apiKey: 'sk_live_new' });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'connection.updated', changed: 'credentials' }),
    ]);
  });

  it("configure validates the new config against the connection's integration", async () => {
    const { svc } = build();
    await expect(svc.configure('org-1', 'con_1', { config: { mode: 'nope' } })).rejects.toThrow(
      InvalidConfigError,
    );
  });

  it('configure patches config/active, appends updated', async () => {
    const { svc, repo, appended } = build();
    await svc.configure('org-1', 'con_1', { active: false });
    expect(repo.update).toHaveBeenCalledWith('org-1', 'con_1', {
      active: false,
      updatedAt: '2026-01-02T00:00:00Z',
    });
    expect(appended).toEqual([
      expect.objectContaining({ type: 'connection.updated', changed: 'configuration' }),
    ]);
  });

  it('disconnect destroys the credential and the connection, appends removed', async () => {
    const { svc, repo, credentials, appended } = build();
    const ok = await svc.disconnect('org-1', 'con_1');
    expect(ok).toBe(true);
    expect(credentials.destroy).toHaveBeenCalledWith('org-1', 'crd_1');
    expect(repo.delete).toHaveBeenCalledWith('org-1', 'con_1');
    // The connection row holds an FK onto the credential row — it must go first.
    const deleteOrder = (repo.delete as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]!;
    const destroyOrder = (credentials.destroy as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0]!;
    expect(deleteOrder).toBeLessThan(destroyOrder);
    expect(appended).toEqual([expect.objectContaining({ type: 'connection.removed' })]);
  });

  it('reconnect/disconnect return null/false for an unknown connection', async () => {
    const { svc, credentials, append } = build(
      fakeRepo({ findById: vi.fn().mockResolvedValue(null) }),
    );
    expect(await svc.reconnect('org-1', 'nope', { apiKey: 'x' })).toBeNull();
    expect(await svc.disconnect('org-1', 'nope')).toBe(false);
    expect(credentials.update).not.toHaveBeenCalled();
    expect(credentials.destroy).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("getByIntegration resolves a consumer's connection", async () => {
    const repo = fakeRepo({ findByIntegration: vi.fn().mockResolvedValue(SAMPLE) });
    const { svc } = build(repo);
    const conn = await svc.getByIntegration('org-1', 'stripe');
    expect(conn?.credentialRef).toBe('crd_1');
    expect(repo.findByIntegration).toHaveBeenCalledWith('org-1', 'stripe');
  });
});

describe('logging', () => {
  it('logs the connection lifecycle at info and rejections at warn', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const repo = fakeRepo();
    const credentials = fakeCredentials();
    const appended: NewDomainEvent[] = [];
    const uow: IntegrationsUnitOfWork = {
      run: (fn) =>
        fn({
          connections: repo,
          credentials,
          outbox: { append: async (e) => void appended.push(...e) },
        }),
    };
    const svc = new IntegrationsServiceImpl(
      registry,
      repo,
      uow,
      () => '2026-01-02T00:00:00Z',
      logger,
    );

    const connection = await svc.connect('org-1', {
      integrationId: 'slack',
      config: {},
      secrets: { botToken: 't' },
    });
    await svc.disconnect('org-1', connection.id);
    await expect(svc.connect('org-1', { integrationId: 'nope', secrets: {} })).rejects.toThrow(
      UnknownIntegrationError,
    );

    expect(entries.map((e) => [e.level, e.msg])).toEqual([
      ['info', 'integration connected'],
      ['info', 'integration disconnected'],
      ['warn', 'unknown integration rejected'],
    ]);
    expect(entries[0]?.meta).toMatchObject({
      orgId: 'org-1',
      integrationId: 'slack',
      connectionId: connection.id,
    });
  });
});
