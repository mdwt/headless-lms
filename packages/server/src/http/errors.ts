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
import { NoActiveOrgError } from './scope.js';
import { UnauthorizedError } from './plugins/auth.js';

export interface ClassifiedError {
  status: number;
  code: string;
  message: string;
}

const RULES: Array<[abstract new (...args: never[]) => Error, number, string]> = [
  [NotFoundError, 404, 'not_found'],
  [ConflictError, 409, 'conflict'],
  [ForbiddenError, 403, 'forbidden'],
  [OrganizationRuleError, 409, 'conflict'],
  [AlreadyConnectedError, 409, 'already_connected'],
  [UnknownIntegrationError, 400, 'unknown_integration'],
  [InvalidConfigError, 400, 'invalid_config'],
  [ActionInvocationError, 502, 'action_failed'],
  [InvalidTriggerError, 400, 'invalid_trigger'],
  [ReservedActionError, 400, 'reserved_action'],
  [AutomationKindMismatchError, 409, 'kind_mismatch'],
  [NoActiveOrgError, 403, 'forbidden'],
  // No session at all — 401 so the client bounces to login, not a generic 403.
  [UnauthorizedError, 401, 'unauthorized'],
];

export function classifyError(error: unknown): ClassifiedError | null {
  for (const [type, status, code] of RULES) {
    if (error instanceof type) {
      return { status, code, message: error.message };
    }
  }
  const err = error as { statusCode?: number; code?: string; message?: string };
  if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return {
      status: err.statusCode,
      code: err.code ?? 'bad_request',
      message: err.message ?? 'Bad request',
    };
  }
  return null;
}
