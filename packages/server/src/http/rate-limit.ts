import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../app/container.js';

export class TooManyRequestsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests. Try again shortly.');
    this.name = 'TooManyRequestsError';
  }
}

const SWEEP_ABOVE = 10_000;

export type RateLimit = (key: string) => number | null;

export function fixedWindowLimit(options: {
  windowSeconds: number;
  max: number;
  now?: () => number;
}): RateLimit {
  const now = options.now ?? Date.now;
  const windowMs = options.windowSeconds * 1000;
  const windows = new Map<string, { count: number; resetAt: number }>();
  let sweepAfter = 0;
  return (key) => {
    const at = now();
    const current = windows.get(key);
    if (!current || current.resetAt <= at) {
      if (windows.size >= SWEEP_ABOVE && at >= sweepAfter) {
        sweepAfter = at + windowMs;
        for (const [seen, window] of windows) {
          if (window.resetAt <= at) {
            windows.delete(seen);
          }
        }
      }
      windows.set(key, { count: 1, resetAt: at + windowMs });
      return null;
    }
    current.count += 1;
    return current.count > options.max ? Math.ceil((current.resetAt - at) / 1000) : null;
  };
}

export function limitByClientIp(container: Pick<Container, 'auth'>, limit: RateLimit) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const wait = limit(container.auth.clientIp(request.headers) ?? request.ip);
    if (wait !== null) {
      reply.header('retry-after', wait);
      throw new TooManyRequestsError(wait);
    }
  };
}
