// automations context — the code-owned catalogs `availableActions()` and
// `availableTriggers()` serve: built-in action definitions and the domain
// event types automations may react to.
import type { EmailTemplateId } from '@headless-lms/types';
import type { AvailableActions, AvailableTriggers } from './types.js';

/** Every EmailTemplateId — a missing key here is a compile error, kept exhaustive by construction. */
export const ALL_EMAIL_TEMPLATE_IDS: Record<EmailTemplateId, true> = {
  magicLink: true,
  studentInvite: true,
  memberInvite: true,
  passwordReset: true,
  emailVerification: true,
  accessGranted: true,
  accessRevoked: true,
  courseCompleted: true,
};

export function catalogActions(): AvailableActions {
  return [
    {
      type: 'sendEmail',
      description: 'Send a transactional email using a built-in template.',
      inputSchema: {
        type: 'object',
        required: ['template'],
        properties: {
          template: { enum: Object.keys(ALL_EMAIL_TEMPLATE_IDS) },
        },
      },
      source: 'system',
    },
  ];
}

// Every domain event type in @headless-lms/types except the automation.*
// family (unauthorable as triggers — the service guards them).
export function catalogTriggers(): AvailableTriggers['triggers'] {
  return [
    { type: 'student.created', description: 'a student was created' },
    { type: 'student.deleted', description: 'a student was deleted' },
    { type: 'student.linked', description: 'a pending student was linked to an auth account' },
    { type: 'invitation.created', description: 'an invitation was created or re-issued' },
    { type: 'invitation.canceled', description: 'a pending invitation was canceled' },
    { type: 'invitation.accepted', description: 'an invitation was accepted' },
    { type: 'course.created', description: 'a course was created' },
    { type: 'course.updated', description: 'a course was updated' },
    { type: 'course.deleted', description: 'a course was deleted' },
    { type: 'entitlement.created', description: 'a student was granted access to content' },
    { type: 'entitlement.updated', description: "an entitlement's status or expiry changed" },
    { type: 'entitlement.deleted', description: "a student's access to content was revoked" },
    { type: 'entitlement.expired', description: 'an entitlement passed its expiry' },
    { type: 'progress.started', description: 'a student started a piece of content' },
    { type: 'progress.completed', description: 'a student completed a piece of content' },
    { type: 'connection.created', description: 'an integration connection was established' },
    { type: 'connection.updated', description: "an integration connection's credentials or configuration changed" },
    { type: 'connection.removed', description: 'an integration connection was removed' },
  ];
}
