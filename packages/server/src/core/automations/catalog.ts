// automations context — the code-owned catalog `available()` serves:
// built-in action definitions. Valid trigger→template pairings are derived
// from actions.ts's derivation table (one source of truth, nothing
// duplicated here).
import type { EmailTemplateId } from '@headless-lms/types';
import { SEND_EMAIL_DERIVATIONS } from './actions.js';
import type { AutomationsAvailable } from './types.js';

/** Every EmailTemplateId — a missing key here is a compile error, kept exhaustive by construction. */
const ALL_EMAIL_TEMPLATE_IDS: Record<EmailTemplateId, true> = {
  magicLink: true,
  studentInvite: true,
  memberInvite: true,
  passwordReset: true,
  emailVerification: true,
  accessGranted: true,
  accessRevoked: true,
  courseCompleted: true,
};

export function catalogActions(): AutomationsAvailable['actions'] {
  const validTemplatesByTrigger: Record<string, EmailTemplateId[]> = {};
  for (const [template, derivation] of Object.entries(SEND_EMAIL_DERIVATIONS) as [
    EmailTemplateId,
    (typeof SEND_EMAIL_DERIVATIONS)[EmailTemplateId],
  ][]) {
    if (!derivation) {
      continue;
    }
    (validTemplatesByTrigger[derivation.trigger] ??= []).push(template);
  }
  return [
    {
      type: 'sendEmail',
      description: 'Send a transactional email using a built-in template.',
      config: {
        type: 'object',
        required: ['template'],
        properties: {
          template: { enum: Object.keys(ALL_EMAIL_TEMPLATE_IDS) },
        },
      },
      validTemplatesByTrigger,
    },
  ];
}
