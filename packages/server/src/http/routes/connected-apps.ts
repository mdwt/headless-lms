// HTTP routes for the connected-apps feature.
// GET  /api/connected-apps        — list tokens the current user has issued
// DELETE /api/connected-apps/:id  — revoke a specific token
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConnectedAppIdParam, ConnectedAppsList, ErrorBody } from '@headless-lms/api-contract';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../composition/container.js';

export async function connectedAppsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['ConnectedApps'];

  r.route({
    method: 'GET',
    url: '/api/connected-apps',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listConnectedApps',
      tags,
      summary: 'List apps the current user has authorized',
      response: { 200: ConnectedAppsList, 401: ErrorBody },
    },
    handler: async (req) => {
      const userId = req.authUser?.id ?? '';
      return container.connectedApps.list(userId);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/connected-apps/:id',
    preHandler: app.requireSession,
    schema: {
      operationId: 'revokeConnectedApp',
      tags,
      summary: "Revoke a connected app's access token",
      params: ConnectedAppIdParam,
      response: { 204: z.void(), 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const userId = req.authUser?.id ?? '';
      const removed = await container.connectedApps.revoke(userId, req.params.id);
      if (!removed) {
        throw new NotFoundError('Token', req.params.id);
      }
      return reply.code(204).send();
    },
  });
}
