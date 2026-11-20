import type { FastifyRequest } from 'fastify';
import type { AppAt } from '@headless-lms/core/shared/apps';
import type { Container } from '../app/container.js';

function webOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  const web = url.protocol === 'https:' || url.protocol === 'http:';
  return web && !url.hostname.includes('*') ? url.origin : null;
}

export function requestDomain(request: FastifyRequest): string | null {
  return webOrigin(request.headers.origin) ?? webOrigin(request.headers.referer);
}

const lookups = new WeakMap<FastifyRequest, Promise<AppAt | null>>();

export function requestApp(
  container: Pick<Container, 'apps' | 'requestContext'>,
  request: FastifyRequest,
): Promise<AppAt | null> {
  const known = lookups.get(request);
  if (known) {
    return known;
  }
  const domain = requestDomain(request);
  const lookup = domain
    ? container.apps.at(domain).then((at) => {
        if (at) {
          container.requestContext.set({ appId: at.app.id });
        }
        return at;
      })
    : Promise.resolve(null);
  lookups.set(request, lookup);
  return lookup;
}
