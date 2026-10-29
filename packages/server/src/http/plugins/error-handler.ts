import {
  ConflictError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '@headless-lms/core/shared/errors';
import { InviteError, OrganizationRuleError } from '@headless-lms/core/organizations';
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
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { NoActiveOrgError } from '../scope.js';
import { UnauthorizedError } from './auth.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

type Refusal = {
  status: number;
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
};

const BODY_ERRORS: Record<string, Refusal> = {
  FST_ERR_CTP_INVALID_JSON_BODY: {
    status: 400,
    error: 'invalid_body',
    message: 'The request body must be valid JSON',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    status: 400,
    error: 'invalid_body',
    message: 'The request body must be valid JSON',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    status: 415,
    error: 'unsupported_media_type',
    message: 'Send the request body as application/json',
  },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    status: 413,
    error: 'payload_too_large',
    message: 'The request body is too large',
  },
  FST_ERR_NOT_FOUND: { status: 404, error: 'not_found', message: 'No such route' },
};

function issuePath(context: string, instancePath: string): string {
  const inner = instancePath
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => (/^\d+$/.test(part) ? `[${part}]` : `.${part}`))
    .join('');
  return `${context}${inner}`;
}

type IssueParams = {
  expected?: string;
  received?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  inclusive?: boolean;
  origin?: string;
  keys?: string[];
  values?: unknown[];
  format?: string;
};

function describeIssue(keyword: string | undefined, params: IssueParams, fallback: string): string {
  switch (keyword) {
    case 'invalid_type':
      if (params.received === 'undefined' || params.received === 'null') {
        return 'is required';
      }
      return params.expected ? `must be ${withArticle(params.expected)}` : fallback;
    case 'too_small':
      return params.origin === 'string'
        ? Number(params.minimum) === 1
          ? 'must not be empty'
          : `must be at least ${params.minimum} characters`
        : params.origin === 'array'
          ? `must have at least ${params.minimum} ${Number(params.minimum) === 1 ? 'item' : 'items'}`
          : `must be ${params.inclusive === false ? 'greater than' : 'at least'} ${params.minimum}`;
    case 'too_big':
      return params.origin === 'string'
        ? `must be at most ${params.maximum} characters`
        : params.origin === 'array'
          ? `must have at most ${params.maximum} items`
          : `must be ${params.inclusive === false ? 'less than' : 'at most'} ${params.maximum}`;
    case 'unrecognized_keys':
      return `has ${params.keys && params.keys.length > 1 ? 'unknown fields' : 'an unknown field'} ${(params.keys ?? []).map((key) => `"${key}"`).join(', ')}`;
    case 'invalid_value':
      return `must be one of ${(params.values ?? []).map((value) => JSON.stringify(value)).join(', ')}`;
    case 'invalid_format':
      return params.format ? `must be a valid ${params.format.replace(/_/g, ' ')}` : fallback;
    case 'invalid_union':
      return 'is not in an accepted shape';
    default:
      return fallback;
  }
}

function withArticle(noun: string): string {
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function refusalFor(error: unknown): Refusal | undefined {
  if (error instanceof NotFoundError) {
    return { status: 404, error: 'not_found', message: error.message };
  }
  if (error instanceof InvalidInputError) {
    return { status: 400, error: 'invalid_input', message: error.message };
  }
  if (error instanceof ConflictError || error instanceof OrganizationRuleError) {
    return { status: 409, error: 'conflict', message: error.message };
  }
  if (error instanceof ForbiddenError || error instanceof NoActiveOrgError) {
    return { status: 403, error: 'forbidden', message: error.message };
  }
  if (error instanceof UnauthorizedError) {
    return { status: 401, error: 'unauthorized', message: error.message };
  }
  if (error instanceof InviteError) {
    return { status: 400, error: 'invalid_invite', message: error.message };
  }
  if (error instanceof AlreadyConnectedError) {
    return { status: 409, error: 'already_connected', message: error.message };
  }
  if (error instanceof UnknownIntegrationError) {
    return { status: 400, error: 'unknown_integration', message: error.message };
  }
  if (error instanceof InvalidConfigError) {
    return { status: 400, error: 'invalid_config', message: error.message };
  }
  if (error instanceof InvalidTriggerError) {
    return { status: 400, error: 'invalid_trigger', message: error.message };
  }
  if (error instanceof ReservedActionError) {
    return { status: 400, error: 'reserved_action', message: error.message };
  }
  if (error instanceof AutomationKindMismatchError) {
    return { status: 409, error: 'kind_mismatch', message: error.message };
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    const context = (error as { validationContext?: string }).validationContext ?? 'request';
    const issues = error.validation.map((issue) => ({
      path: issuePath(context, issue.instancePath),
      message: describeIssue(
        issue.keyword,
        (issue.params ?? {}) as IssueParams,
        issue.message ?? 'is invalid',
      ),
    }));
    const first = issues[0];
    return {
      status: 400,
      error: 'validation',
      message: first ? `${first.path}: ${first.message}` : 'The request is invalid',
      issues,
    };
  }
  const err = error as { statusCode?: number; code?: string };
  if (err.code && BODY_ERRORS[err.code]) {
    return BODY_ERRORS[err.code];
  }
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return {
      status: err.statusCode,
      error: 'bad_request',
      message: 'The request could not be processed',
    };
  }
  return undefined;
}

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
  const refusal = refusalFor(error);
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
