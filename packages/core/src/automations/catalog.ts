// automations context — the code-owned catalogs `availableActions()` and
// `availableTriggers()` serve: built-in action definitions and the domain
// event types automations may react to.
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

export function catalogTriggers(): AvailableTriggers['triggers'] {
  return [
    { type: identityEvents.userCreated.type, label: 'User created', category: 'Users', description: 'a user was created' },
    { type: identityEvents.userUpdated.type, label: 'User updated', category: 'Users', description: 'a user was updated' },
    { type: organizationEvents.organizationCreated.type, label: 'Organization created', category: 'Organization', description: 'an organization was created' },
    { type: organizationEvents.organizationUpdated.type, label: 'Organization updated', category: 'Organization', description: 'an organization was updated' },
    { type: organizationEvents.organizationDeleted.type, label: 'Organization deleted', category: 'Organization', description: 'an organization was deleted' },
    { type: organizationEvents.orgUserLinked.type, label: 'Member joined', category: 'Organization', description: 'a user was linked to an organization' },
    { type: organizationEvents.orgUserDeleted.type, label: 'Member removed', category: 'Organization', description: 'a user was removed from an organization' },
    { type: organizationEvents.inviteCreated.type, label: 'Invite sent', category: 'Organization', description: 'an invite was created or re-issued' },
    { type: organizationEvents.inviteAccepted.type, label: 'Invite accepted', category: 'Organization', description: 'an invite was accepted' },
    { type: organizationEvents.studentCreated.type, label: 'Student created', category: 'Students', description: 'a student was created' },
    { type: organizationEvents.studentDeleted.type, label: 'Student deleted', category: 'Students', description: 'a student was deleted' },
    { type: organizationEvents.studentLinked.type, label: 'Student linked to account', category: 'Students', description: 'a pending student was linked to an auth account' },
    { type: contentEvents.courseCreated.type, label: 'Course created', category: 'Courses', description: 'a course was created' },
    { type: contentEvents.courseUpdated.type, label: 'Course updated', category: 'Courses', description: 'a course was updated' },
    { type: contentEvents.courseDeleted.type, label: 'Course deleted', category: 'Courses', description: 'a course was deleted' },
    { type: contentEvents.moduleCreated.type, label: 'Module created', category: 'Courses', description: 'a course module was created' },
    { type: contentEvents.moduleUpdated.type, label: 'Module updated', category: 'Courses', description: 'a course module was updated' },
    { type: contentEvents.moduleDeleted.type, label: 'Module deleted', category: 'Courses', description: 'a course module was deleted' },
    { type: contentEvents.modulesReordered.type, label: 'Modules reordered', category: 'Courses', description: 'course modules were reordered' },
    { type: contentEvents.activityCreated.type, label: 'Activity created', category: 'Courses', description: 'a course activity was created' },
    { type: contentEvents.activityUpdated.type, label: 'Activity updated', category: 'Courses', description: 'a course activity was updated' },
    { type: contentEvents.activityDeleted.type, label: 'Activity deleted', category: 'Courses', description: 'a course activity was deleted' },
    { type: contentEvents.activitiesReordered.type, label: 'Activities reordered', category: 'Courses', description: 'course activities were reordered' },
    { type: contentEvents.downloadCreated.type, label: 'Download created', category: 'Downloads', description: 'a download was created' },
    { type: contentEvents.downloadUpdated.type, label: 'Download updated', category: 'Downloads', description: 'a download was updated' },
    { type: contentEvents.downloadDeleted.type, label: 'Download deleted', category: 'Downloads', description: 'a download was deleted' },
    { type: contentEvents.downloadAssetAdded.type, label: 'Download file added', category: 'Downloads', description: 'a download asset was added' },
    { type: contentEvents.downloadAssetRemoved.type, label: 'Download file removed', category: 'Downloads', description: 'a download asset was removed' },
    { type: contentEvents.downloadAssetRenamed.type, label: 'Download file renamed', category: 'Downloads', description: 'a download asset was renamed' },
    { type: contentEvents.downloadAssetsReordered.type, label: 'Download files reordered', category: 'Downloads', description: 'download assets were reordered' },
    { type: entitlementEvents.entitlementCreated.type, label: 'Access granted', category: 'Access', description: 'a student was granted access to content' },
    { type: entitlementEvents.entitlementUpdated.type, label: 'Access updated', category: 'Access', description: "an entitlement's status or expiry changed" },
    { type: entitlementEvents.entitlementDeleted.type, label: 'Access revoked', category: 'Access', description: "a student's access to content was revoked" },
    { type: entitlementEvents.entitlementExpired.type, label: 'Access expired', category: 'Access', description: 'an entitlement passed its expiry' },
    { type: progressEvents.progressStarted.type, label: 'Progress started', category: 'Progress', description: 'a student started a progress record' },
    { type: progressEvents.progressCompleted.type, label: 'Progress completed', category: 'Progress', description: 'a student completed a progress record' },
    { type: integrationEvents.connectionCreated.type, label: 'Integration connected', category: 'Integrations', description: 'an integration connection was established' },
    { type: integrationEvents.connectionUpdated.type, label: 'Integration updated', category: 'Integrations', description: 'an integration connection changed' },
    { type: integrationEvents.connectionRemoved.type, label: 'Integration disconnected', category: 'Integrations', description: 'an integration connection was removed' },
    { type: discussionEvents.commentCreated.type, label: 'Comment created', category: 'Discussion', description: 'a comment was created' },
    { type: discussionEvents.commentPublished.type, label: 'Comment published', category: 'Discussion', description: 'a comment was published' },
    { type: discussionEvents.commentRemoved.type, label: 'Comment removed', category: 'Discussion', description: 'a comment was removed' },
    { type: discussionEvents.commentReported.type, label: 'Comment reported', category: 'Discussion', description: 'a comment was reported' },
    { type: assetEvents.assetCreated.type, label: 'Upload requested', category: 'Assets', description: 'an asset upload was requested' },
    { type: assetEvents.assetReady.type, label: 'Upload ready', category: 'Assets', description: 'an asset was confirmed ready' },
    { type: assetEvents.assetDeleted.type, label: 'Asset deleted', category: 'Assets', description: 'an asset was deleted' },
  ];
}
