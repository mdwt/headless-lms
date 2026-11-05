import { z } from 'zod';
import {
  contentTypeSchema,
  inviteSchema,
  levelSchema,
  organizationSchema,
  orgUserSchema,
} from '../types/schemas/index.js';
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
    roleKey: true,
    status: true,
    invitedBy: true,
    expiresAt: true,
    createdAt: true,
    updatedAt: true,
  })
  .strip();

const orgUserWithRole = orgUserSchema.extend({ orgRole: z.object({ key: z.string() }) });
const publicOrgUserWithRole = publicOrgUser.extend({ orgRole: z.object({ key: z.string() }) });

const roleSnapshot = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  base: z.string(),
  levels: z.array(levelSchema),
  team: z.boolean(),
  permissions: z.array(z.string()),
});

const roleUpdated = z.object({ key: z.string(), before: roleSnapshot, after: roleSnapshot });
const roleCreated = z.object({ role: roleSnapshot });
const roleDeleted = z.object({ key: z.string() });
const roleAssigned = z.object({
  orgUserId: z.string(),
  roleKey: z.string(),
  contentId: z.string().nullable(),
  contentType: contentTypeSchema.nullable(),
  previousRoleKey: z.string().nullable(),
});
const roleUnassigned = z.object({
  orgUserId: z.string(),
  roleKey: z.string(),
  contentId: z.string(),
  contentType: contentTypeSchema,
});
const ownershipTransferred = z.object({
  previousOwnerOrgUserId: z.string(),
  newOwnerOrgUserId: z.string(),
});

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
    version: 2,
    data: orgUserWithRole,
    publicData: publicOrgUserWithRole,
  }),
  orgUserDeleted: defineEvent({
    type: 'organization.user.deleted',
    version: 2,
    data: orgUserWithRole,
    publicData: publicOrgUserWithRole,
  }),
  orgUserUpdated: defineEvent({
    type: 'organization.user.updated',
    version: 2,
    data: orgUserWithRole,
    publicData: publicOrgUserWithRole,
  }),
  inviteCreated: defineEvent({
    type: 'organization.invite.created',
    version: 2,
    data: inviteSchema,
    publicData: publicInvite,
  }),
  inviteAccepted: defineEvent({
    type: 'organization.invite.accepted',
    version: 2,
    data: inviteSchema,
    publicData: publicInvite,
  }),
  inviteCanceled: defineEvent({
    type: 'organization.invite.canceled',
    version: 2,
    data: inviteSchema,
  }),
  studentCreated: defineEvent({
    type: 'organization.student.created',
    version: 2,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
  studentDeleted: defineEvent({
    type: 'organization.student.deleted',
    version: 2,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
  roleUpdated: defineEvent({
    type: 'organization.role.updated',
    version: 1,
    data: roleUpdated,
    publicData: roleUpdated,
  }),
  roleCreated: defineEvent({
    type: 'organization.role.created',
    version: 1,
    data: roleCreated,
    publicData: roleCreated,
  }),
  roleDeleted: defineEvent({
    type: 'organization.role.deleted',
    version: 1,
    data: roleDeleted,
    publicData: roleDeleted,
  }),
  roleAssigned: defineEvent({
    type: 'organization.role.assigned',
    version: 1,
    data: roleAssigned,
    publicData: roleAssigned,
  }),
  roleUnassigned: defineEvent({
    type: 'organization.role.unassigned',
    version: 1,
    data: roleUnassigned,
    publicData: roleUnassigned,
  }),
  ownershipTransferred: defineEvent({
    type: 'organization.ownership.transferred',
    version: 1,
    data: ownershipTransferred,
    publicData: ownershipTransferred,
  }),
  studentLinked: defineEvent({
    type: 'organization.student.linked',
    version: 2,
    data: orgUserSchema,
    publicData: publicOrgUser,
  }),
};

export type OrganizationCreated = EventOf<typeof organizationEvents.organizationCreated>;
export type OrganizationUpdated = EventOf<typeof organizationEvents.organizationUpdated>;
export type OrganizationDeleted = EventOf<typeof organizationEvents.organizationDeleted>;
export type OrgUserLinked = EventOf<typeof organizationEvents.orgUserLinked>;
export type OrgUserDeleted = EventOf<typeof organizationEvents.orgUserDeleted>;
export type OrgUserUpdated = EventOf<typeof organizationEvents.orgUserUpdated>;
export type InviteCreated = EventOf<typeof organizationEvents.inviteCreated>;
export type InviteAccepted = EventOf<typeof organizationEvents.inviteAccepted>;
export type InviteCanceled = EventOf<typeof organizationEvents.inviteCanceled>;
export type StudentCreated = EventOf<typeof organizationEvents.studentCreated>;
export type StudentDeleted = EventOf<typeof organizationEvents.studentDeleted>;
export type StudentLinked = EventOf<typeof organizationEvents.studentLinked>;
export type RoleUpdated = EventOf<typeof organizationEvents.roleUpdated>;
export type RoleCreated = EventOf<typeof organizationEvents.roleCreated>;
export type RoleDeleted = EventOf<typeof organizationEvents.roleDeleted>;
export type RoleAssigned = EventOf<typeof organizationEvents.roleAssigned>;
export type RoleUnassigned = EventOf<typeof organizationEvents.roleUnassigned>;
export type OwnershipTransferred = EventOf<typeof organizationEvents.ownershipTransferred>;
export type OrganizationEvent = EventOfValues<typeof organizationEvents>;
