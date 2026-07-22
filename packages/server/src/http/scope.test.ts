import { describe, it, expect } from 'vitest';
import { resolveScope, NoActiveOrgError } from './scope.js';
import type { Container } from '../app/container.js';
import type { FastifyRequest } from 'fastify';

function container(opts: {
  org?: { id: string; name: string; slug: string } | null;
  user?: { id: string } | null;
  membership?: { id: string; orgId: string; role: string } | null;
}): Container {
  return {
    organizations: {
      getByExternalId: async () => opts.org ?? null,
      getMembershipByUser: async () => opts.membership ?? null,
    },
    identity: { getUserByExternalId: async () => opts.user ?? null },
  } as unknown as Container;
}

const req = (authUser: unknown, orgId: string | null = 'ext_org_1') =>
  ({ authUser, orgId }) as unknown as FastifyRequest;

const acme = { id: 'org_1', name: 'Acme', slug: 'acme' };
const membership = { id: 'mem_1', orgId: 'org_1', role: 'owner' };

describe('resolveScope', () => {
  it('resolves { orgId, userId, authOrgId } for a staff member', async () => {
    const scope = await resolveScope(
      container({ org: acme, user: { id: 'usr_1' }, membership }),
      req({ id: 'ext_1' }),
    );
    expect(scope).toEqual({ orgId: 'org_1', userId: 'usr_1', authOrgId: 'ext_org_1' });
  });

  it('throws NoActiveOrgError when the session user has no org membership', async () => {
    await expect(
      resolveScope(container({ org: acme, user: { id: 'usr_1' }, membership: null }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when there is no session user', async () => {
    await expect(resolveScope(container({ org: acme }), req(undefined))).rejects.toBeInstanceOf(
      NoActiveOrgError,
    );
  });

  it('throws NoActiveOrgError when the session carries no active org', async () => {
    await expect(
      resolveScope(container({ org: acme, user: { id: 'usr_1' }, membership }), req({ id: 'ext_1' }, null)),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when the active org is not found', async () => {
    await expect(
      resolveScope(container({ org: null, user: { id: 'usr_1' }, membership }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when there is no domain user for the session user', async () => {
    await expect(
      resolveScope(container({ org: acme, user: null, membership }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });
});
