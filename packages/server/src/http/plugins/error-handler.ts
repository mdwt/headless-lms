import type { FastifyReply, FastifyRequest } from 'fastify';
import { classifyError } from '../errors.js';

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const known = classifyError(error);
  if (known) {
    return reply.status(known.status).send({ error: known.code, message: known.message });
  }
  request.log.error({ err: error }, `unhandled error in ${request.method} ${request.url}`);
  return reply.status(500).send({ error: 'internal_error', requestId: request.id });
}
