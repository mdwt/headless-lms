// automations context — action runners. `executeAction` maps one
// AutomationAction against the DomainEvent that triggered its run.
//
// SEND_EMAIL_DERIVATIONS is the sendEmail runner's internal derivation table:
// which (trigger, template) pairings are derivable. A template with no entry
// (e.g. courseCompleted) makes `executeAction` throw a named error, recorded
// by the engine as a failed action.
import type { EmailTemplateId, EmailTemplateParams } from '../types/index.js';
import { deliverWebhookInputSchema } from '../types/schemas/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import type { Mailer, MailerLookups } from '../shared/mailer.js';
import type { CredentialStore, DomainEvent } from '../shared/ports.js';
import type { AutomationAction } from './model.js';
import type { WebhookSender } from './ports.js';
import { ALL_EMAIL_TEMPLATE_IDS, DELIVER_WEBHOOK_ACTION } from './catalog.js';
import { webhookHeaders } from './webhook-signing.js';

export interface ActionDeps {
  mailer: Pick<Mailer, 'send'>;
  lookups: MailerLookups;
  credentials: Pick<CredentialStore, 'reveal'>;
  webhooks: WebhookSender;
}

interface SendEmailDerivation<K extends EmailTemplateId> {
  /** The only event type this template's params can be derived from. */
  trigger: string;
  /** Undefined = the recipient or content behind the event's ids cannot be resolved. */
  derive(
    event: DomainEvent,
    lookups: MailerLookups,
  ): Promise<{ to: string; params: EmailTemplateParams[K] } | undefined>;
}

type SendEmailDerivations = { [K in EmailTemplateId]?: SendEmailDerivation<K> };

export const SEND_EMAIL_DERIVATIONS: SendEmailDerivations = {
  accessGranted: {
    trigger: 'entitlement.created',
    derive: async (event, lookups) => {
      const result = entitlementEvents.entitlementCreated.safeParse(event);
      if (!result.success) {
        return undefined;
      }
      const entitlement = result.data.data;
      // Bundle grants carry no content id — this email is per content item.
      if (!entitlement.contentId) {
        return undefined;
      }
      const [to, content] = await Promise.all([
        lookups.orgUserEmail(entitlement.orgId, entitlement.orgUserId),
        lookups.contentInfo(entitlement.orgId, entitlement.contentId),
      ]);
      if (!to || !content) {
        return undefined;
      }
      return {
        to,
        params: { contentTitle: content.title, contentId: content.id, contentType: content.type },
      };
    },
  },
  accessRevoked: {
    trigger: 'entitlement.deleted',
    derive: async (event, lookups) => {
      const result = entitlementEvents.entitlementDeleted.safeParse(event);
      if (!result.success) {
        return undefined;
      }
      const entitlement = result.data.data;
      // Bundle grants carry no content id — this email is per content item.
      if (!entitlement.contentId) {
        return undefined;
      }
      const [to, content] = await Promise.all([
        lookups.orgUserEmail(entitlement.orgId, entitlement.orgUserId),
        lookups.contentInfo(entitlement.orgId, entitlement.contentId),
      ]);
      if (!to || !content) {
        return undefined;
      }
      return {
        to,
        params: { contentTitle: content.title },
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
  deps: ActionDeps,
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
      const derived = await derivation.derive(event, deps.lookups);
      if (!derived) {
        throw new Error(
          `sendEmail: event "${event.type}" is missing the data required to derive template "${template}"`,
        );
      }
      await deps.mailer.send(derived.to, template, derived.params);
      return;
    }
    case DELIVER_WEBHOOK_ACTION: {
      await deliverWebhook(action, event, deps);
      return;
    }
    default: {
      throw new Error(`unknown automation action type "${action.type}"`);
    }
  }
}

async function deliverWebhook(
  action: AutomationAction,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<void> {
  const input = deliverWebhookInputSchema.safeParse(action.input);
  if (!input.success) {
    throw new Error(`${DELIVER_WEBHOOK_ACTION}: invalid input`);
  }
  const secrets = await deps.credentials.reveal(event.orgId, input.data.secretRef);
  const secret = secrets?.['secret'];
  if (typeof secret !== 'string') {
    throw new Error(`${DELIVER_WEBHOOK_ACTION}: signing secret not found`);
  }
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const response = await deps.webhooks.send({
    url: input.data.url,
    headers: webhookHeaders(secret, event.id, timestamp, body),
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${DELIVER_WEBHOOK_ACTION}: endpoint responded ${response.status}`);
  }
}
