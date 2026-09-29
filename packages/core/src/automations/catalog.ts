// automations context — the code-owned catalogs `availableActions()` and
// `availableTriggers()` serve: built-in action definitions and the domain
// event types automations may react to.
import type { z } from 'zod';
import type { EmailTemplateId } from '../types/index.js';
import { assetEvents } from '../assets/index.js';
import { contentEvents } from '../content/index.js';
import { discussionEvents } from '../discussion/index.js';
import { entitlementEvents } from '../entitlements/index.js';
import { identityEvents } from '../identity/index.js';
import { integrationEvents } from '../integrations/index.js';
import { organizationEvents } from '../organizations/index.js';
import { progressEvents } from '../progress/index.js';
import type { AvailableActions, AvailableTriggers } from './types.js';

/** Every EmailTemplateId — a missing key here is a compile error, kept exhaustive by construction. */
export const ALL_EMAIL_TEMPLATE_IDS: Record<EmailTemplateId, true> = {
  magicLink: true,
  studentInvite: true,
  memberInvite: true,
  passwordReset: true,
  passwordChanged: true,
  emailVerification: true,
  accessGranted: true,
  accessRevoked: true,
  courseCompleted: true,
};

export const DELIVER_WEBHOOK_ACTION = 'deliverWebhook';

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

interface CatalogTrigger {
  readonly event: { readonly type: string; readonly publicData: z.ZodType };
  readonly label: string;
  readonly category: string;
  readonly description: string;
}

const TRIGGERS: CatalogTrigger[] = [
  {
    event: identityEvents.userCreated,
    label: 'User created',
    category: 'Users',
    description: 'a user was created',
  },
  {
    event: identityEvents.userUpdated,
    label: 'User updated',
    category: 'Users',
    description: 'a user was updated',
  },
  {
    event: organizationEvents.organizationCreated,
    label: 'Organization created',
    category: 'Organization',
    description: 'an organization was created',
  },
  {
    event: organizationEvents.organizationUpdated,
    label: 'Organization updated',
    category: 'Organization',
    description: 'an organization was updated',
  },
  {
    event: organizationEvents.organizationDeleted,
    label: 'Organization deleted',
    category: 'Organization',
    description: 'an organization was deleted',
  },
  {
    event: organizationEvents.orgUserLinked,
    label: 'Member joined',
    category: 'Organization',
    description: 'a user was linked to an organization',
  },
  {
    event: organizationEvents.orgUserDeleted,
    label: 'Member removed',
    category: 'Organization',
    description: 'a user was removed from an organization',
  },
  {
    event: organizationEvents.inviteCreated,
    label: 'Invite sent',
    category: 'Organization',
    description: 'an invite was created or re-issued',
  },
  {
    event: organizationEvents.inviteAccepted,
    label: 'Invite accepted',
    category: 'Organization',
    description: 'an invite was accepted',
  },
  {
    event: organizationEvents.studentCreated,
    label: 'Student created',
    category: 'Students',
    description: 'a student was created',
  },
  {
    event: organizationEvents.studentDeleted,
    label: 'Student deleted',
    category: 'Students',
    description: 'a student was deleted',
  },
  {
    event: organizationEvents.studentLinked,
    label: 'Student linked to account',
    category: 'Students',
    description: 'a pending student was linked to an auth account',
  },
  {
    event: contentEvents.courseCreated,
    label: 'Course created',
    category: 'Courses',
    description: 'a course was created',
  },
  {
    event: contentEvents.courseUpdated,
    label: 'Course updated',
    category: 'Courses',
    description: 'a course was updated',
  },
  {
    event: contentEvents.courseDeleted,
    label: 'Course deleted',
    category: 'Courses',
    description: 'a course was deleted',
  },
  {
    event: contentEvents.moduleCreated,
    label: 'Module created',
    category: 'Courses',
    description: 'a course module was created',
  },
  {
    event: contentEvents.moduleUpdated,
    label: 'Module updated',
    category: 'Courses',
    description: 'a course module was updated',
  },
  {
    event: contentEvents.moduleDeleted,
    label: 'Module deleted',
    category: 'Courses',
    description: 'a course module was deleted',
  },
  {
    event: contentEvents.modulesReordered,
    label: 'Modules reordered',
    category: 'Courses',
    description: 'course modules were reordered',
  },
  {
    event: contentEvents.activityCreated,
    label: 'Activity created',
    category: 'Courses',
    description: 'a course activity was created',
  },
  {
    event: contentEvents.activityUpdated,
    label: 'Activity updated',
    category: 'Courses',
    description: 'a course activity was updated',
  },
  {
    event: contentEvents.activityDeleted,
    label: 'Activity deleted',
    category: 'Courses',
    description: 'a course activity was deleted',
  },
  {
    event: contentEvents.activitiesReordered,
    label: 'Activities reordered',
    category: 'Courses',
    description: 'course activities were reordered',
  },
  {
    event: contentEvents.downloadCreated,
    label: 'Download created',
    category: 'Downloads',
    description: 'a download was created',
  },
  {
    event: contentEvents.downloadUpdated,
    label: 'Download updated',
    category: 'Downloads',
    description: 'a download was updated',
  },
  {
    event: contentEvents.downloadDeleted,
    label: 'Download deleted',
    category: 'Downloads',
    description: 'a download was deleted',
  },
  {
    event: contentEvents.downloadAssetAdded,
    label: 'Download file added',
    category: 'Downloads',
    description: 'a download asset was added',
  },
  {
    event: contentEvents.downloadAssetRemoved,
    label: 'Download file removed',
    category: 'Downloads',
    description: 'a download asset was removed',
  },
  {
    event: contentEvents.downloadAssetRenamed,
    label: 'Download file renamed',
    category: 'Downloads',
    description: 'a download asset was renamed',
  },
  {
    event: contentEvents.downloadAssetsReordered,
    label: 'Download files reordered',
    category: 'Downloads',
    description: 'download assets were reordered',
  },
  {
    event: entitlementEvents.entitlementCreated,
    label: 'Access granted',
    category: 'Access',
    description: 'a student was granted access to content',
  },
  {
    event: entitlementEvents.entitlementUpdated,
    label: 'Access updated',
    category: 'Access',
    description: "an entitlement's status or expiry changed",
  },
  {
    event: entitlementEvents.entitlementDeleted,
    label: 'Access revoked',
    category: 'Access',
    description: "a student's access to content was revoked",
  },
  {
    event: entitlementEvents.entitlementExpired,
    label: 'Access expired',
    category: 'Access',
    description: 'an entitlement passed its expiry',
  },
  {
    event: progressEvents.progressStarted,
    label: 'Progress started',
    category: 'Progress',
    description: 'a student started a progress record',
  },
  {
    event: progressEvents.progressCompleted,
    label: 'Progress completed',
    category: 'Progress',
    description: 'a student completed a progress record',
  },
  {
    event: integrationEvents.connectionCreated,
    label: 'Integration connected',
    category: 'Integrations',
    description: 'an integration connection was established',
  },
  {
    event: integrationEvents.connectionUpdated,
    label: 'Integration updated',
    category: 'Integrations',
    description: 'an integration connection changed',
  },
  {
    event: integrationEvents.connectionRemoved,
    label: 'Integration disconnected',
    category: 'Integrations',
    description: 'an integration connection was removed',
  },
  {
    event: discussionEvents.commentCreated,
    label: 'Comment created',
    category: 'Discussion',
    description: 'a comment was created',
  },
  {
    event: discussionEvents.commentPublished,
    label: 'Comment published',
    category: 'Discussion',
    description: 'a comment was published',
  },
  {
    event: discussionEvents.commentRemoved,
    label: 'Comment removed',
    category: 'Discussion',
    description: 'a comment was removed',
  },
  {
    event: discussionEvents.commentReported,
    label: 'Comment reported',
    category: 'Discussion',
    description: 'a comment was reported',
  },
  {
    event: assetEvents.assetCreated,
    label: 'Upload requested',
    category: 'Assets',
    description: 'an asset upload was requested',
  },
  {
    event: assetEvents.assetReady,
    label: 'Upload ready',
    category: 'Assets',
    description: 'an asset was confirmed ready',
  },
  {
    event: assetEvents.assetDeleted,
    label: 'Asset deleted',
    category: 'Assets',
    description: 'an asset was deleted',
  },
];

export function catalogTriggers(): AvailableTriggers['triggers'] {
  return TRIGGERS.map(({ event, ...trigger }) => ({ type: event.type, ...trigger }));
}

export function publicDataSchema(type: string): z.ZodType | undefined {
  return TRIGGERS.find((trigger) => trigger.event.type === type)?.event.publicData;
}
