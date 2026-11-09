import { describe, it, expect } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { actorWith } from '@headless-lms/core/organizations';
import type { CallerLimit } from '@headless-lms/core/organizations';
import { resolveCaller, resolveCallerFor, NoActiveOrgError } from './scope.js';
import type { Container } from '../app/container.js';

type OrgUser = { id: string; orgId: string; status: 'active' | 'invited' };

function container(opts: {
  calls?: { resolve: number };
  org?: { id: string; name: string; slug: string } | null;
  user?: { id: string } | null;
  orgUsers?: Record<string, OrgUser>;
  seen?: Array<{ orgId: string; orgUserId: string; limit?: CallerLimit }>;
}): Container {
  const organizations = {
    getById: async () => opts.org ?? null,
    getByExternalId: async (id: string) => (id === opts.org?.id ? opts.org : null),
    getOrgUser: async (orgId: string, userId: string) =>
      opts.orgUsers?.[`${orgId}:${userId}`] ?? null,
    actorFor: async (orgId: string, orgUserId: string, limit?: CallerLimit) => {
      opts.seen?.push({ orgId, orgUserId, ...(limit && { limit }) });
      const row = Object.values(opts.orgUsers ?? {}).find((u) => u.id === orgUserId);
      return row?.status === 'active' ? actorWith({ id: orgUserId, orgId, owner: true }) : null;
    },
  };
  const identity = {
    getUserByExternalId: async (id: string) => (id === opts.user?.id ? opts.user : null),
  };
  return {
    organizations: {
      ...organizations,
      resolveCaller: async (authOrgId: string, authUserId: string, limit?: CallerLimit) => {
        if (opts.calls) {
          opts.calls.resolve += 1;
        }
        const org = await organizations.getByExternalId(authOrgId);
        if (!org) {
          return null;
        }
        const user = await identity.getUserByExternalId(authUserId);
        const orgUser = user ? await organizations.getOrgUser(org.id, user.id) : null;
        const actor = orgUser ? await organizations.actorFor(org.id, orgUser.id, limit) : null;
        return { orgId: org.id, userId: user?.id ?? null, orgUserId: orgUser?.id ?? null, actor };
      },
    },
    identity: {
      getUserByExternalId: async (id: string) => (id === opts.user?.id ? opts.user : null),
    },
    requestContext: {
      run: (_fields: unknown, fn: () => void) => fn(),
      set: () => {},
      current: () => ({}),
    },
  } as unknown as Container;
}

const req = (authUser: { id: string } | null, authOrgId: string | null = 'org_1') =>
  ({
    authUserId: authUser?.id,
    authOrgId,
    orgId: authOrgId ? 'org_1' : undefined,
  }) as unknown as FastifyRequest;

const acme = { id: 'org_1', name: 'Acme', slug: 'acme' };
const active = { 'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', status: 'active' as const } };

describe('resolveCaller', () => {
  it("resolves the caller's actor in the session's active org", async () => {
    const caller = await resolveCaller(
      container({ org: acme, user: { id: 'usr_1' }, orgUsers: active }),
      req({ id: 'usr_1' }),
    );
    expect(caller).toMatchObject({
      orgId: 'org_1',
      userId: 'usr_1',
      orgUserId: 'orm_1',
      authOrgId: 'org_1',
      authUserId: 'usr_1',
    });
    expect(caller.actor).toMatchObject({ id: 'orm_1', orgId: 'org_1' });
  });

  it('resolves the org user of the active org, not of another org', async () => {
    const caller = await resolveCaller(
      container({
        org: acme,
        user: { id: 'usr_1' },
        orgUsers: {
          'org_2:usr_1': { id: 'orm_2', orgId: 'org_2', status: 'active' },
          ...active,
        },
      }),
      req({ id: 'usr_1' }),
    );
    expect(caller.orgUserId).toBe('orm_1');
  });

  it('refuses an org user who has not accepted their invitation', async () => {
    await expect(
      resolveCaller(
        container({
          org: acme,
          user: { id: 'usr_1' },
          orgUsers: { 'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', status: 'invited' } },
        }),
        req({ id: 'usr_1' }),
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('refuses a person with no org user in the active org', async () => {
    await expect(
      resolveCaller(
        container({
          org: acme,
          user: { id: 'usr_1' },
          orgUsers: { 'org_2:usr_1': { id: 'orm_2', orgId: 'org_2', status: 'active' } },
        }),
        req({ id: 'usr_1' }),
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('refuses without a session user, an active org, the org or the domain user', async () => {
    const c = container({ org: acme, user: { id: 'usr_1' }, orgUsers: active });
    await expect(resolveCaller(c, req(null))).rejects.toBeInstanceOf(NoActiveOrgError);
    await expect(resolveCaller(c, req({ id: 'usr_1' }, null))).rejects.toBeInstanceOf(
      NoActiveOrgError,
    );
    await expect(
      resolveCaller(container({ org: null, user: { id: 'usr_1' } }), req({ id: 'usr_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
    await expect(
      resolveCaller(container({ org: acme, user: null }), req({ id: 'usr_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });
});

describe('resolving once per request', () => {
  it('resolves the caller in one read and reuses it for every later call in the request', async () => {
    const calls = { resolve: 0 };
    const c = container({ calls, org: acme, user: { id: 'usr_1' }, orgUsers: active });
    const request = req({ id: 'usr_1' });
    const first = await resolveCaller(c, request);
    const second = await resolveCaller(c, request);
    expect(calls.resolve).toBe(1);
    expect(second.actor).toBe(first.actor);
  });

  it('uses the caller the session guard already resolved, without reading again', async () => {
    const calls = { resolve: 0 };
    const c = container({ calls, org: acme, user: { id: 'usr_1' }, orgUsers: active });
    const actor = actorWith({ id: 'orm_1', orgId: 'org_1', owner: true });
    const request = req({ id: 'usr_1' }) as FastifyRequest & { resolvedCaller: unknown };
    request.resolvedCaller = { orgId: 'org_1', userId: 'usr_1', orgUserId: 'orm_1', actor };
    await expect(resolveCaller(c, request)).resolves.toMatchObject({ orgUserId: 'orm_1', actor });
    expect(calls.resolve).toBe(0);
  });
});

describe('resolveCallerFor', () => {
  it("builds the actor with the token's scopes", async () => {
    const seen: Array<{ orgId: string; orgUserId: string; limit?: CallerLimit }> = [];
    const caller = await resolveCallerFor(
      container({ org: acme, user: { id: 'usr_1' }, orgUsers: active, seen }),
      'usr_1',
      'org_1',
      { scopes: ['courses:read'] },
    );
    expect(caller.orgUserId).toBe('orm_1');
    expect(seen).toEqual([
      { orgId: 'org_1', orgUserId: 'orm_1', limit: { scopes: ['courses:read'] } },
    ]);
  });

  it('refuses an unknown org or user', async () => {
    await expect(
      resolveCallerFor(container({ org: null }), 'usr_1', 'org_1', { scopes: [] }),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
    await expect(
      resolveCallerFor(container({ org: acme, user: null }), 'usr_1', 'org_1', { scopes: [] }),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });
});
