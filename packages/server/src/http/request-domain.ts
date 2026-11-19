import type { FastifyRequest } from 'fastify';

export function requestDomain(request: FastifyRequest): string | null {
  const value = request.headers.origin || request.headers.referer;
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
}
