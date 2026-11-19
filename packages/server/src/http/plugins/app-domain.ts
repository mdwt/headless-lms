import type { FastifyInstance } from 'fastify';
import type { Container } from '../../app/container.js';
import { requestDomain } from '../request-domain.js';

export function registerAppDomain(app: FastifyInstance, container: Container): void {
  app.decorateRequest('appAt', null);
  app.addHook('onRequest', async (request) => {
    const domain = request.method === 'OPTIONS' ? null : requestDomain(request);
    const at = domain ? await container.organizations.lookupDomain(domain) : null;
    if (at) {
      request.appAt = at;
      container.requestContext.set({ appId: at.app.id });
    }
  });
}
