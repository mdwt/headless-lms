// automations context — action runners. `executeAction` maps one
// AutomationAction against the DomainEvent that triggered its run.
//
// SEND_EMAIL_DERIVATIONS is the sendEmail runner's internal derivation table:
// which (trigger, template) pairings are derivable. A template with no entry
// (e.g. courseCompleted) makes `executeAction` throw a named error, recorded
// by the engine as a failed action.
import type { EmailTemplateId, NotificationKind } from '../types/index.js';
import { deliverWebhookInputSchema, notificationKindSchema } from '../types/schemas/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import type { NewNotification } from '../identity/index.js';
import type { DomainEvent } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { ActionFailedError, type AutomationAction } from './model.js';
import type { WebhookResponse } from './ports.js';
import {
  ALL_EMAIL_TEMPLATE_IDS,
  DELIVER_WEBHOOK_ACTION,
  NOTIFY_ACTION,
  publicDataSchema,
} from './catalog.js';
import { webhookHeaders } from './webhook-signing.js';
import { address, firedAtOf, type ActionDeps, type EmailRecipient } from './community-mail.js';
import { COMMUNITY_DERIVATIONS, type EmailDerivation } from './community-derivations.js';
import { NOTIFICATION_PLACEMENTS } from './community-notifications.js';

type SendEmailDerivations = { [K in EmailTemplateId]?: EmailDerivation<K> };

export const SEND_EMAIL_DERIVATIONS: SendEmailDerivations = {
  accessGranted: {
    triggers: ['entitlement.created'],
    derive: async (event, deps) => {
      const result = entitlementEvents.entitlementCreated.safeParse(event);
      if (!result.success) {
        return undefined;
      }
      const entitlement = result.data.data;
      if (!entitlement.contentId) {
        return [];
      }
      const content = await deps.lookups.contentInfo(entitlement.orgId, entitlement.contentId);
      if (!content) {
        return undefined;
      }
      return address(deps, event, entitlement.orgId, [entitlement.orgUserId], {
        contentTitle: content.title,
        contentId: content.id,
        contentType: content.type,
      });
    },
  },
  accessRevoked: {
    triggers: ['entitlement.deleted'],
    derive: async (event, deps) => {
      const result = entitlementEvents.entitlementDeleted.safeParse(event);
      if (!result.success) {
        return undefined;
      }
      const entitlement = result.data.data;
      if (!entitlement.contentId) {
        return [];
      }
      const content = await deps.lookups.contentInfo(entitlement.orgId, entitlement.contentId);
      if (!content) {
        return undefined;
      }
      return address(deps, event, entitlement.orgId, [entitlement.orgUserId], {
        contentTitle: content.title,
      });
    },
  },
  ...COMMUNITY_DERIVATIONS,
};

export type { ActionDeps, EmailRecipient };

/** Who an action reached, and who a delivery to failed for (a partial failure does not throw). */
export interface ActionOutcome {
  recipients: string[];
  failed: string[];
}

function reachedNoOne(): ActionOutcome {
  return { recipients: [], failed: [] };
}

function assertSomeDelivered(action: string, outcome: ActionOutcome): ActionOutcome {
  if (outcome.recipients.length === 0 && outcome.failed.length > 0) {
    throw new ActionFailedError(
      `${action}: delivery failed for all ${outcome.failed.length} recipients`,
    );
  }
  return outcome;
}

function isEmailTemplateId(value: unknown): value is EmailTemplateId {
  return typeof value === 'string' && value in ALL_EMAIL_TEMPLATE_IDS;
}

/** Throws on any failure but a partial fan-out — the engine owns retry policy and failure bookkeeping. */
export async function executeAction(
  action: AutomationAction,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<ActionOutcome> {
  switch (action.type) {
    case 'sendEmail': {
      const template = action.input['template'];
      if (!isEmailTemplateId(template)) {
        throw new ActionFailedError(`sendEmail: unknown template "${String(template)}"`);
      }
      const derivation = SEND_EMAIL_DERIVATIONS[template];
      if (!derivation || !derivation.triggers.includes(event.type)) {
        throw new ActionFailedError(
          `sendEmail: template "${template}" cannot be derived from event "${event.type}"`,
        );
      }
      const derived = await derivation.derive(event, { ...deps, actionInput: action.input });
      if (!derived) {
        throw new ActionFailedError(
          `sendEmail: event "${event.type}" is missing the data required to derive template "${template}"`,
        );
      }
      const outcome = reachedNoOne();
      for (const recipient of derived) {
        const list = (await send(template, recipient, event, deps))
          ? outcome.recipients
          : outcome.failed;
        list.push(recipient.orgUserId);
      }
      return assertSomeDelivered('sendEmail', outcome);
    }
    case NOTIFY_ACTION: {
      const kind = notificationKindSchema.safeParse(action.input['kind']);
      if (!kind.success) {
        throw new ActionFailedError(
          `${NOTIFY_ACTION}: unknown kind "${String(action.input['kind'])}"`,
        );
      }
      return notify(kind.data, event, { ...deps, actionInput: action.input });
    }
    case 'grantAccess': {
      await grantAccess(action, event, deps);
      return reachedNoOne();
    }
    case 'publishDuePosts': {
      await deps.scheduledWork.publishDuePosts(event.orgId, firedAtOf(event));
      return reachedNoOne();
    }
    case 'expireDueGrants': {
      await deps.scheduledWork.expireDueGrants(event.orgId, firedAtOf(event));
      return reachedNoOne();
    }
    case 'sendDigest': {
      await deps.scheduledWork.sendDigest(event.orgId, firedAtOf(event));
      return reachedNoOne();
    }
    case 'removeUnattachedUploads': {
      await deps.scheduledWork.removeUnattachedUploads(event.orgId, firedAtOf(event));
      return reachedNoOne();
    }
    case DELIVER_WEBHOOK_ACTION: {
      await deliverWebhook(action, event, deps);
      return reachedNoOne();
    }
    default: {
      throw new ActionFailedError(`unknown automation action type "${action.type}"`);
    }
  }
}

async function send<K extends EmailTemplateId>(
  template: K,
  recipient: EmailRecipient<K>,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<boolean> {
  try {
    await deps.mailer.send(recipient.to, template, recipient.params);
    return true;
  } catch (err) {
    (deps.logger ?? noopLogger).warn('automation email not delivered', {
      orgId: event.orgId,
      automationId: deps.automationId,
      trigger: event.type,
      template,
      orgUserId: recipient.orgUserId,
      err,
    });
    return false;
  }
}

async function notify<K extends NotificationKind>(
  kind: K,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<ActionOutcome> {
  const derivation = SEND_EMAIL_DERIVATIONS[kind] as EmailDerivation<K> | undefined;
  if (!derivation || !derivation.triggers.includes(event.type)) {
    throw new ActionFailedError(
      `${NOTIFY_ACTION}: kind "${kind}" cannot be derived from event "${event.type}"`,
    );
  }
  const recipients = await derivation.derive(event, deps);
  if (!recipients) {
    throw new ActionFailedError(
      `${NOTIFY_ACTION}: event "${event.type}" is missing the data required to derive kind "${kind}"`,
    );
  }
  const preferences = await deps.desk.preferencesFor(
    event.orgId,
    recipients.map((recipient) => recipient.userId),
    kind,
  );
  const placement = NOTIFICATION_PLACEMENTS[kind];
  const notifications: NewNotification[] = [];
  const outcome = reachedNoOne();
  for (const recipient of recipients) {
    const preference = preferences[recipient.userId];
    const email = preference?.email !== false;
    const inApp = preference?.inApp !== false;
    const emailed = email && (await send(kind, recipient, event, deps));
    let placed = false;
    if (inApp) {
      try {
        const placements = await placement.place(event, recipient, deps);
        notifications.push(
          ...placements.map((spot) => ({ ...spot, userId: recipient.userId, kind })),
        );
        placed = true;
      } catch (err) {
        (deps.logger ?? noopLogger).warn('automation notification not placed', {
          orgId: event.orgId,
          automationId: deps.automationId,
          trigger: event.type,
          kind,
          orgUserId: recipient.orgUserId,
          err,
        });
      }
    }
    if (emailed || placed) {
      outcome.recipients.push(recipient.orgUserId);
    }
    if ((email && !emailed) || (inApp && !placed)) {
      outcome.failed.push(recipient.orgUserId);
    }
  }
  await deps.desk.notify(event.orgId, notifications);
  return assertSomeDelivered(NOTIFY_ACTION, outcome);
}

function grantRecipient(event: DomainEvent): string | undefined {
  if (typeof event.data !== 'object' || event.data === null) {
    return undefined;
  }
  const data = event.data as Record<string, unknown>;
  if (event.type === 'organization.student.created' && typeof data.id === 'string') {
    return data.id;
  }
  if (typeof data.orgUserId === 'string') {
    return data.orgUserId;
  }
  return undefined;
}

async function grantAccess(
  action: AutomationAction,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<void> {
  const contentId = typeof action.input.contentId === 'string' ? action.input.contentId : null;
  const bundleId = typeof action.input.bundleId === 'string' ? action.input.bundleId : null;
  if ((contentId == null) === (bundleId == null)) {
    throw new ActionFailedError('grantAccess: provide exactly one of contentId or bundleId');
  }
  const orgUserId = grantRecipient(event);
  if (!orgUserId) {
    throw new ActionFailedError(`grantAccess: event "${event.type}" has no recipient`);
  }
  const days = action.input.expiresInDays;
  const expiresAt =
    typeof days === 'number' && Number.isFinite(days)
      ? new Date(Date.now() + days * 86_400_000)
      : null;
  await deps.grants.grant(event.orgId, { orgUserId, contentId, bundleId, expiresAt });
}

async function deliverWebhook(
  action: AutomationAction,
  event: DomainEvent,
  deps: ActionDeps,
): Promise<void> {
  const input = deliverWebhookInputSchema.safeParse(action.input);
  if (!input.success) {
    throw new ActionFailedError(`${DELIVER_WEBHOOK_ACTION}: invalid input`);
  }
  const publicData = publicDataSchema(event.type);
  if (!publicData) {
    throw new ActionFailedError(
      `${DELIVER_WEBHOOK_ACTION}: event "${event.type}" is not published`,
    );
  }
  const data = publicData.safeParse(event.data);
  if (!data.success) {
    throw new ActionFailedError(
      `${DELIVER_WEBHOOK_ACTION}: event "${event.type}" does not match its published shape`,
    );
  }
  const secrets = await deps.credentials.reveal(event.orgId, input.data.secretRef);
  const secret = secrets?.['secret'];
  if (typeof secret !== 'string') {
    throw new ActionFailedError(`${DELIVER_WEBHOOK_ACTION}: signing secret not found`);
  }
  const body = JSON.stringify({
    id: event.id,
    type: event.type,
    version: event.version,
    orgId: event.orgId,
    occurredAt: event.occurredAt,
    data: data.data,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  let response: WebhookResponse;
  try {
    response = await deps.webhooks.send({
      url: input.data.url,
      headers: webhookHeaders(secret, event.id, timestamp, body),
      body,
    });
  } catch (err) {
    (deps.logger ?? noopLogger).warn('webhook endpoint not reached', {
      orgId: event.orgId,
      automationId: deps.automationId,
      eventId: event.id,
      err,
    });
    throw new ActionFailedError(`${DELIVER_WEBHOOK_ACTION}: the endpoint could not be reached`);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ActionFailedError(`${DELIVER_WEBHOOK_ACTION}: endpoint responded ${response.status}`);
  }
}
