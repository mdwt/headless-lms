import { describe, it, expect } from 'vitest';
import { resolveStudentScope, NoStudentError } from './student-scope.js';
import type { Container } from '../composition/container.js';
import type { FastifyRequest } from 'fastify';

function container(opts: {
  student?: { id: string } | null;
  org?: { id: string; name: string; slug: string } | null;
}): Container {
  return {
    organizations: { getByExternalId: async () => opts.org ?? null },
    identity: { getStudentByExternalId: async () => opts.student ?? null },
  } as unknown as Container;
}

// The session carries the org (activeOrganizationId → req.orgId), stamped at login.
const req = (authUser: unknown, orgId: string | null = 'ext_org_1') =>
  ({ authUser, orgId }) as unknown as FastifyRequest;

const acme = { id: 'org_1', name: 'Acme', slug: 'acme' };

describe('resolveStudentScope', () => {
  it('resolves { studentId, orgId, org } from the session user + session org', async () => {
    const scope = await resolveStudentScope(
      container({ student: { id: 'stu_1' }, org: acme }),
      req({ id: 'ext_1' }),
    );
    expect(scope).toEqual({ studentId: 'stu_1', orgId: 'org_1', org: acme });
  });

  it('throws NoStudentError when there is no session user', async () => {
    await expect(
      resolveStudentScope(container({ org: acme }), req(undefined)),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the session carries no org', async () => {
    await expect(
      resolveStudentScope(container({ student: { id: 'stu_1' } }), req({ id: 'ext_1' }, null)),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the session org is not found', async () => {
    await expect(
      resolveStudentScope(container({ org: null }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the user is not a student in the org', async () => {
    await expect(
      resolveStudentScope(container({ student: null, org: acme }), req({ id: 'ext_x' })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });
});
