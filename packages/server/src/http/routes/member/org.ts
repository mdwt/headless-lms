import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MemberOrg, MemberViewer, refusals } from '../../schemas/index.js';
import type { Container } from '../../../app/container.js';
import { resolveActor } from '../../scope.js';

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
      return container.organizations.portalIdentity(req.orgId);
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
        'For a member of the organization: your org user id, which the member API keys on, your org role, the permissions you hold anywhere, and those you hold on the org.',
      response: { 200: MemberViewer, ...refusals(403) },
    },
    handler: async (req) => {
      const actor = await resolveActor(container, req);
      return container.reporting.member.viewer(actor);
    },
  });
}
