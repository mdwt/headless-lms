import { inviteSchema, organizationSchema, orgUserSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';

const publicOrganization = organizationSchema
  .pick({
    id: true,
    name: true,
    slug: true,
    ownerId: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicOrgUser = orgUserSchema
  .pick({
    id: true,
    orgId: true,
    userId: true,
    role: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const publicInvite = inviteSchema
  .pick({
    id: true,
    orgId: true,
    email: true,
    role: true,
    status: true,
    invitedBy: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

export const organizationEvents = {
  organizationCreated: defineEvent({
    type: 'organization.created',
    version: 1,
    data: organizationSchema,
    publicData: publicOrganization,
  }),
  organizationUpdated: defineEvent({
    type: 'organization.updated',
    version: 1,
    data: organizationSchema,
    publicData: publicOrganization,
  }),
  organizationDeleted: defineEvent({
    type: 'organization.deleted',
    version: 1,
    data: organizationSchema,
    publicData: publicOrganization,
  }),
  orgUserLinked: defineEvent({
    type: 'organization.user.linked',
    version: 1,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
  orgUserDeleted: defineEvent({
    type: 'organization.user.deleted',
    version: 1,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
  inviteCreated: defineEvent({
    type: 'organization.invite.created',
    version: 1,
    data: inviteSchema,
    publicData: publicInvite,
  }),
  inviteAccepted: defineEvent({
    type: 'organization.invite.accepted',
    version: 1,
    data: inviteSchema,
    publicData: publicInvite,
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
    publicData: publicOrgUser,
  }),
  studentDeleted: defineEvent({
    type: 'organization.student.deleted',
    version: 1,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
  studentLinked: defineEvent({
    type: 'organization.student.linked',
    version: 1,
    data: orgUserSchema,
    publicData: publicOrgUser,
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
