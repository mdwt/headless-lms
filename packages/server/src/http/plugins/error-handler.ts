import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActionInvocationError } from '@headless-lms/core/integrations';
import { isResponseSerializationError } from 'fastify-type-provider-zod';
import { classifyError } from '../errors.js';

function routeOf(request: FastifyRequest): string {
  return `${request.method} ${request.routeOptions.url ?? 'unmatched route'}`;
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ActionInvocationError) {
    request.log.error(
      { err: error, integrationId: error.integrationId, actionId: error.actionId },
      `integration action failed in ${routeOf(request)}`,
    );
    return reply.status(502).send({
      error: 'action_failed',
      message: 'The integration did not respond as expected',
    });
  }
  const refusal = classifyError(error);
  if (refusal) {
    request.log.info(
      {
        status: refusal.status,
        error: refusal.error,
        message: refusal.message,
        ...(refusal.issues && { issues: refusal.issues }),
        ...(refusal.error === 'bad_request' && { cause: (error as Error).message }),
      },
      `${routeOf(request)} refused`,
    );
    return reply.status(refusal.status).send({
      error: refusal.error,
      message: refusal.message,
      ...(refusal.issues && { issues: refusal.issues }),
    });
  }
  if (isResponseSerializationError(error)) {
    request.log.error(
      { err: error, issues: error.cause.issues },
      `response of ${routeOf(request)} does not match its schema`,
    );
  } else {
    request.log.error({ err: error }, `unhandled error in ${routeOf(request)}`);
  }
  return reply.status(500).send({
    error: 'internal_error',
    message: 'Something went wrong on our side. Quote the request id when reporting it.',
    requestId: request.id,
  });
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  request.log.info(
    { status: 404, error: 'not_found' },
    `${request.method} unmatched route refused`,
  );
  return reply
    .status(404)
    .send({ error: 'not_found', message: `No route for ${request.method} ${request.url}` });
}
