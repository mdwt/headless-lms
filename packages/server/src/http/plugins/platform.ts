import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PlatformKeyCheck } from '../../app/platform.js';
import { UnauthorizedError } from './auth.js';

const BEARER = /^Bearer\s+(\S+)$/i;

export function registerPlatformAuth(app: FastifyInstance, platform: PlatformKeyCheck): void {
  app.decorate('requirePlatform', async (request: FastifyRequest) => {
    const match = BEARER.exec(request.headers.authorization ?? '');
    if (!match || !platform.matches(match[1]!)) {
      throw new UnauthorizedError('The platform key is not valid');
    }
  });
}
