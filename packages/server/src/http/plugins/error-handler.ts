import { ConflictError, ForbiddenError, NotFoundError } from '@headless-lms/core/shared/errors';
import { OrganizationRuleError } from '@headless-lms/core/organizations';
import {
  ActionInvocationError,
  AlreadyConnectedError,
  InvalidConfigError,
  UnknownIntegrationError,
} from '@headless-lms/core/integrations';
import {
  AutomationKindMismatchError,
  InvalidTriggerError,
  ReservedActionError,
} from '@headless-lms/core/automations';
import { NoActiveOrgError } from '../scope.js';
import { UnauthorizedError } from './auth.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof NotFoundError) {
    return reply.status(404).send({ error: 'not_found', message: error.message });
  }
  if (error instanceof ConflictError) {
    return reply.status(409).send({ error: 'conflict', message: error.message });
  }
  if (error instanceof ForbiddenError) {
    return reply.status(403).send({ error: 'forbidden', message: error.message });
  }
  if (error instanceof OrganizationRuleError) {
    return reply.status(409).send({ error: 'conflict', message: error.message });
  }
  if (error instanceof AlreadyConnectedError) {
    return reply.status(409).send({ error: 'already_connected', message: error.message });
  }
  if (error instanceof UnknownIntegrationError) {
    return reply.status(400).send({ error: 'unknown_integration', message: error.message });
  }
  if (error instanceof InvalidConfigError) {
    return reply.status(400).send({ error: 'invalid_config', message: error.message });
  }
  if (error instanceof ActionInvocationError) {
    return reply.status(502).send({ error: 'action_failed', message: error.message });
  }
  if (error instanceof InvalidTriggerError) {
    return reply.status(400).send({ error: 'invalid_trigger', message: error.message });
  }
  if (error instanceof ReservedActionError) {
    return reply.status(400).send({ error: 'reserved_action', message: error.message });
  }
  if (error instanceof AutomationKindMismatchError) {
    return reply.status(409).send({ error: 'kind_mismatch', message: error.message });
  }
  if (error instanceof NoActiveOrgError) {
    return reply.status(403).send({ error: 'forbidden', message: error.message });
  }
  // No session at all — 401 so the client bounces to login, not a generic 403.
  if (error instanceof UnauthorizedError) {
    return reply.status(401).send({ error: 'unauthorized', message: error.message });
  }
  const err = error as { statusCode?: number; code?: string; message?: string };
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return reply
      .status(err.statusCode)
      .send({ error: err.code ?? 'bad_request', message: err.message ?? 'Bad request' });
  }
  request.log.error({ err: error }, `unhandled error in ${request.method} ${request.url}`);
  return reply.status(500).send({ error: 'internal_error', requestId: request.id });
}
