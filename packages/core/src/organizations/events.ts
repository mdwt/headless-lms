import { inviteSchema, organizationSchema, orgUserSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

export const organizationEvents = {
  organizationCreated: defineEvent({
    type: 'organization.created',
    version: 1,
    data: organizationSchema,
  }),
  organizationUpdated: defineEvent({
    type: 'organization.updated',
    version: 1,
    data: organizationSchema,
  }),
  organizationDeleted: defineEvent({
    type: 'organization.deleted',
    version: 1,
    data: organizationSchema,
  }),
  orgUserLinked: defineEvent({
    type: 'organization.user.linked',
    version: 1,
    data: orgUserSchema,
  }),
  orgUserDeleted: defineEvent({
    type: 'organization.user.deleted',
    version: 1,
    data: orgUserSchema,
  }),
  inviteCreated: defineEvent({
    type: 'organization.invite.created',
    version: 1,
    data: inviteSchema,
  }),
  inviteAccepted: defineEvent({
    type: 'organization.invite.accepted',
    version: 1,
    data: inviteSchema,
  }),
  inviteCanceled: defineEvent({
    type: 'organization.invite.canceled',
    version: 1,
    data: inviteSchema,
  }),
  studentCreated: defineEvent({
    type: 'organization.student.created',
    version: 1,
    data: orgUserSchema,
  }),
  studentDeleted: defineEvent({
    type: 'organization.student.deleted',
    version: 1,
    data: orgUserSchema,
  }),
  studentLinked: defineEvent({
    type: 'organization.student.linked',
    version: 1,
    data: orgUserSchema,
  }),
};

export type OrganizationCreated = EventOf<typeof organizationEvents.organizationCreated>;
export type OrganizationUpdated = EventOf<typeof organizationEvents.organizationUpdated>;
export type OrganizationDeleted = EventOf<typeof organizationEvents.organizationDeleted>;
export type OrgUserLinked = EventOf<typeof organizationEvents.orgUserLinked>;
export type OrgUserDeleted = EventOf<typeof organizationEvents.orgUserDeleted>;
export type InviteCreated = EventOf<typeof organizationEvents.inviteCreated>;
export type InviteAccepted = EventOf<typeof organizationEvents.inviteAccepted>;
export type InviteCanceled = EventOf<typeof organizationEvents.inviteCanceled>;
export type StudentCreated = EventOf<typeof organizationEvents.studentCreated>;
export type StudentDeleted = EventOf<typeof organizationEvents.studentDeleted>;
export type StudentLinked = EventOf<typeof organizationEvents.studentLinked>;
export type OrganizationEvent = EventOfValues<typeof organizationEvents>;
