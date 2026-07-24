// automations context — action runners. `executeAction` maps one
// AutomationAction against the DomainEvent that triggered its run.
//
// SEND_EMAIL_DERIVATIONS is the sendEmail runner's internal derivation table:
// which (trigger, template) pairings are derivable. A template with no entry
// (e.g. courseCompleted) makes `executeAction` throw a named error, recorded
// by the engine as a failed action.
import type { EmailTemplateId, EmailTemplateParams } from '@headless-lms/types';
import type { Entitlement } from '../entitlements/index.js';
import type { Mailer } from '../shared/mailer.js';
import type { DomainEvent } from '../shared/ports.js';
import type { AutomationAction } from './model.js';
import { ALL_EMAIL_TEMPLATE_IDS } from './catalog.js';

interface SendEmailDerivation<K extends EmailTemplateId> {
  /** The only event type this template's params can be derived from. */
  trigger: string;
  /** Undefined = the event doesn't actually carry the expected snapshot. */
  derive(event: DomainEvent): { to: string; params: EmailTemplateParams[K] } | undefined;
}

type SendEmailDerivations = { [K in EmailTemplateId]?: SendEmailDerivation<K> };

/** An entitlement-carrying event, as emitted by entitlement.created|deleted. */
interface EntitlementEventLike extends DomainEvent {
  entitlement: Entitlement;
}

function hasEntitlement(event: DomainEvent): event is EntitlementEventLike {
  return (
    typeof (event as { entitlement?: unknown }).entitlement === 'object' &&
    (event as { entitlement?: unknown }).entitlement !== null
  );
}

export const SEND_EMAIL_DERIVATIONS: SendEmailDerivations = {
  accessGranted: {
    trigger: 'entitlement.created',
    derive: (event) => {
      if (!hasEntitlement(event)) {
        return undefined;
      }
      return {
        to: event.entitlement.studentEmail,
        params: { contentTitle: event.entitlement.content.title, contentId: event.entitlement.content.id },
      };
    },
  },
  accessRevoked: {
    trigger: 'entitlement.deleted',
    derive: (event) => {
      if (!hasEntitlement(event)) {
        return undefined;
      }
      return {
        to: event.entitlement.studentEmail,
        params: { contentTitle: event.entitlement.content.title },
      };
    },
  },
};

function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && value in ALL_EMAIL_TEMPLATE_IDS;
}

/** Throws on any failure — the engine owns retry policy and failure bookkeeping. */
export async function executeAction(
  action: AutomationAction,
  event: DomainEvent,
  mailer: Pick<Mailer, 'send'>,
): Promise<void> {
  switch (action.type) {
    case 'sendEmail': {
      const template = action.input['template'];
      if (!isEmailTemplateId(template)) {
        throw new Error(`sendEmail: unknown template "${String(template)}"`);
      }
      const derivation = SEND_EMAIL_DERIVATIONS[template];
      if (!derivation || derivation.trigger !== event.type) {
        throw new Error(
          `sendEmail: template "${template}" cannot be derived from event "${event.type}"`,
        );
      }
      const derived = derivation.derive(event);
      if (!derived) {
        throw new Error(
          `sendEmail: event "${event.type}" is missing the data required to derive template "${template}"`,
        );
      }
      await mailer.send(derived.to, template, derived.params);
      return;
    }
    default: {
      throw new Error(`unknown automation action type "${action.type}"`);
    }
  }
}
