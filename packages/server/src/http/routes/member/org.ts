import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MemberOrg, MemberViewer, refusals } from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';
import { actorOf } from './actor.js';

export async function memberOrgRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.route({
    method: 'GET',
    url: '/api/member/org',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberOrg',
      tags: ['Organizations'],
      summary: "Get the portal org's public identity (branding)",
      description:
        'For any signed-in person whose session has this organization active. Name and slug only.',
      response: { 200: MemberOrg },
    },
    handler: async (req) => {
      // The session's org (from `activeOrganizationId`) — surface its display
      // identity for the portal brand.
      const org = await container.organizations.getById(req.orgId);
      if (!org) {
        throw new UnauthorizedError('Your session points to an organization that no longer exists');
      }
      return { id: org.id, name: org.name, slug: org.slug };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/member/viewer',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getMemberViewer',
      tags: ['Organizations'],
      summary: "Get the caller's identity within the session's org",
      description:
        'For a member of the organization: your org user id, which the member API keys on, and your role here.',
      response: { 200: MemberViewer, ...refusals(403) },
    },
    handler: async (req) => {
      const orgUser = await actorOf(container, req.orgId, req.userId);
      return { orgUserId: orgUser.id, role: orgUser.role };
    },
  });
}
