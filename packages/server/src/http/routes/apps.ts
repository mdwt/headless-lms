import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import {
  App,
  AppIdParam,
  AppList,
  AppLookup,
  CreateApp,
  UpdateApp,
  appView,
  refusals,
} from '../schemas/index.js';
import { resolveActor } from '../scope.js';
import { fixedWindowLimit, limitByClientIp } from '../rate-limit.js';
import { requestApp, requestDomain } from '../request-domain.js';

const LOOKUP_WINDOW_SECONDS = 10;
const LOOKUP_MAX = 100;

export async function appsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const apps = container.apps;
  const tags = ['Apps'];
  const limit = fixedWindowLimit({ windowSeconds: LOOKUP_WINDOW_SECONDS, max: LOOKUP_MAX });

  r.route({
    method: 'GET',
    url: '/api/app',
    preHandler: limitByClientIp(container, limit),
    schema: {
      operationId: 'getApp',
      tags,
      summary: 'The app and organization of the domain the request comes from',
      description: `Public: no session and no key. Answers for the domain in the \`Origin\` header, or else the \`Referer\`; it takes no domain as a parameter. A frontend's server sends its visitor's domain as \`Origin\` and the visitor's IP address as \`X-Forwarded-For\`. 404 when the request carries no domain or the domain is no app's. Limited to ${LOOKUP_MAX} requests in ${LOOKUP_WINDOW_SECONDS} seconds per client IP address (429, with \`Retry-After\`).`,
      response: { 200: AppLookup, ...refusals(404, 429) },
    },
    handler: async (req) => {
      const at = await requestApp(container, req);
      if (!at) {
        throw new NotFoundError('App', requestDomain(req) ?? 'no domain');
      }
      return {
        organization: { name: at.organization.name },
        app: { name: at.app.name, courses: at.app.courses, community: at.app.community },
      };
    },
  });

  r.route({
    method: 'GET',
    url: '/api/apps',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listApps',
      tags,
      summary: "The organization's apps",
      description: `Requires \`organizations:read\`. An app is a frontend the organization runs on a domain; it serves courses, the community, or both. Links in emails, invites and calendar files use the domain of the app that serves what the link is about.`,
      response: { 200: AppList, ...refusals(403) },
    },
    handler: async (req) => (await apps.list(await resolveActor(container, req))).map(appView),
  });

  r.route({
    method: 'POST',
    url: '/api/apps',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createApp',
      tags,
      summary: 'Create an app',
      description: `Requires \`organizations:write\`. 409, with the reason as \`error\`: \`domain_taken\` when another app has the domain, in this organization or any other; \`domain_reserved\` when the domain is the admin app's, the API's or another listed origin of the installation; \`slug_taken\`; \`courses_taken\` or \`community_taken\` when the organization already has an app that serves it. 400 when the app would serve neither, or the domain is not a bare origin: a path, a query, a username or password, a wildcard or a trailing dot is refused.`,
      body: CreateApp,
      response: { 201: App, ...refusals(400, 403, 409) },
    },
    handler: async (req, reply) =>
      reply
        .code(201)
        .send(appView(await apps.create(req.body, await resolveActor(container, req)))),
  });

  r.route({
    method: 'PATCH',
    url: '/api/apps/:appId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateApp',
      tags,
      summary: 'Change an app',
      description: `Requires \`organizations:write\`. Changes what is sent; the next link uses the new domain, and people sign in on it from the next request. 409 and 400 for the same reasons as creating an app, 400 also when the change would leave the app serving neither.`,
      params: AppIdParam,
      body: UpdateApp,
      response: { 200: App, ...refusals(400, 403, 404, 409) },
    },
    handler: async (req) =>
      appView(await apps.update(req.params.appId, req.body, await resolveActor(container, req))),
  });

  r.route({
    method: 'DELETE',
    url: '/api/apps/:appId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteApp',
      tags,
      summary: 'Delete an app',
      description: `Requires \`organizations:write\`. Its domain stops reaching the organization, and frees up for another app.`,
      params: AppIdParam,
      response: { 204: z.void(), ...refusals(403, 404) },
    },
    handler: async (req, reply) => {
      await apps.delete(req.params.appId, await resolveActor(container, req));
      return reply.code(204).send();
    },
  });
}
