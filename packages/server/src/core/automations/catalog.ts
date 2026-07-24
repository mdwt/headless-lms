// automations context — the code-owned catalog `available()` serves:
// triggers and built-in action definitions. Triggers and valid
// trigger→template pairings are derived from actions.ts's derivation table
// (one source of truth, nothing duplicated here).
import type { EmailTemplateId } from '@headless-lms/types';
import { SEND_EMAIL_DERIVATIONS } from './actions.js';
import type { AutomationsAvailable } from './types.js';

const TRIGGER_DESCRIPTIONS: Record<string, string> = {
  'entitlement.created': 'A student is granted access to a piece of content.',
  'entitlement.deleted': "A student's access to a piece of content is revoked.",
};

/** Every EmailTemplateId, kept exhaustive by construction: a missing key here
 *  is a compile error, so a new template can't silently fall out of the
 *  action's config schema. */
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

/** Only the triggers with at least one derivable sendEmail pairing are
 *  listed — the catalog only advertises what a user can actually configure. */
export function catalogTriggers(): AutomationsAvailable['triggers'] {
  const triggers = new Set<string>();
  for (const derivation of Object.values(SEND_EMAIL_DERIVATIONS)) {
    if (derivation) {
      triggers.add(derivation.trigger);
    }
  }
  return [...triggers].map((type) => ({ type, description: TRIGGER_DESCRIPTIONS[type] ?? type }));
}

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
