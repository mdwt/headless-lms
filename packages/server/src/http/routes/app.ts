import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { AppLookup, refusals } from '../schemas/index.js';
import { fixedWindowLimit, limitByClientIp } from '../rate-limit.js';
import { requestDomain } from '../request-domain.js';

const LOOKUP_WINDOW_SECONDS = 10;
const LOOKUP_MAX = 100;

export async function appRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const limit = fixedWindowLimit({ windowSeconds: LOOKUP_WINDOW_SECONDS, max: LOOKUP_MAX });

  r.route({
    method: 'GET',
    url: '/api/app',
    preHandler: limitByClientIp(container, limit),
    schema: {
      operationId: 'getApp',
      tags: ['Organizations'],
      summary: 'The app and organization of the domain the request comes from',
      description: `Public: no session and no key. Answers for the domain in the \`Origin\` header, or else the \`Referer\`; it takes no domain as a parameter. A frontend's server sends its visitor's domain as \`Origin\` and the visitor's IP address as \`X-Forwarded-For\`. 404 when the request carries no domain or the domain is no app's. Limited to ${LOOKUP_MAX} requests in ${LOOKUP_WINDOW_SECONDS} seconds per client IP address (429, with \`Retry-After\`).`,
      response: { 200: AppLookup, ...refusals(404, 429) },
    },
    handler: async (req) => {
      const at = req.appAt;
      if (!at) {
        throw new NotFoundError('App', requestDomain(req) ?? 'no domain');
      }
      return {
        organization: { name: at.organization.name },
        app: { name: at.app.name, courses: at.app.courses, community: at.app.community },
      };
    },
  });
}
