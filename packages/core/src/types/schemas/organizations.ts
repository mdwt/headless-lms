import { z } from 'zod';
import { idSchema, emailSchema } from './shared.js';
import { contentTypeSchema } from './content.js';

export const levelSchema = z.union([z.literal('org'), z.lazy(() => contentTypeSchema)]);
export type Level = z.infer<typeof levelSchema>;

export const PERMISSION_KEYS = [
  'organizations:read',
  'organizations:write',
  'api_keys:read',
  'api_keys:write',
  'api_keys:delete',
  'notification_categories:read',
  'notification_categories:write',
  'integrations:read',
  'integrations:write',
  'integrations:delete',
  'analytics:read',
  'people:read',
  'people:write',
  'people:delete',
  'roles:read',
  'roles:write',
  'roles:delete',
  'access:read',
  'access:write',
  'bundles:read',
  'bundles:write',
  'bundles:delete',
  'media:read',
  'media:write',
  'media:delete',
  'courses:read',
  'courses:write',
  'courses:delete',
  'courses:moderate',
  'progress:read',
  'downloads:read',
  'downloads:write',
  'downloads:delete',
  'communities:read',
  'communities:write',
  'communities:delete',
  'communities:moderate',
  'automations:read',
  'automations:write',
  'automations:delete',
] as const;

export const permissionSchema = z.enum(PERMISSION_KEYS);
export type Permission = z.infer<typeof permissionSchema>;

export const roleKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-zA-Z0-9_]*$/,
    'A role key starts with a lowercase letter and holds letters, digits and underscores',
  );
export type RoleKey = z.infer<typeof roleKeySchema>;

export const orgRoleRowSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    key: z.string(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    base: z.string(),
    levels: z.array(levelSchema).nullable(),
    permissions: z.record(z.string(), z.boolean()),
    team: z.boolean().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type OrgRoleRow = z.output<typeof orgRoleRowSchema>;

export const roleAssignmentSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    orgUserId: idSchema,
    roleKey: z.string(),
    contentId: idSchema.nullable(),
    contentType: z.lazy(() => contentTypeSchema).nullable(),
    assignedBy: z.string(),
    createdAt: z.coerce.date(),
  })
  .strict();
export type RoleAssignment = z.output<typeof roleAssignmentSchema>;

export const orgUserStatusSchema = z.enum(['invited', 'active']);
export type OrgUserStatus = z.infer<typeof orgUserStatusSchema>;

export const organizationSchema = z
  .object({
    id: idSchema,
    externalId: idSchema.nullable(),
    name: z.string(),
    slug: z.string(),
    ownerId: idSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Organization = z.output<typeof organizationSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;

export const orgUserSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    userId: idSchema,
    status: orgUserStatusSchema,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type OrgUser = z.output<typeof orgUserSchema>;
export type OrgUserInput = z.input<typeof orgUserSchema>;

export const orgUserProfileSchema = z
  .object({
    id: idSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    email: emailSchema,
    image: z.string().nullable(),
  })
  .strict();
export type OrgUserProfile = z.infer<typeof orgUserProfileSchema>;

export const inviteSchema = z
  .object({
    id: idSchema,
    orgId: idSchema,
    email: emailSchema,
    roleKey: z.string(),
    status: z.enum(['pending', 'accepted', 'rejected', 'canceled']),
    invitedBy: idSchema,
    tokenHash: z.string().nullable(),
    expiresAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();
export type Invite = z.output<typeof inviteSchema>;
export type InviteInput = z.input<typeof inviteSchema>;

export const newOrganizationInputSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    logo: z.string().optional(),
  })
  .strict();
export type NewOrganizationInput = z.infer<typeof newOrganizationInputSchema>;

export const addOrgUserInputSchema = z
  .object({
    orgId: idSchema,
    userId: idSchema,
  })
  .strict();
export type AddOrgUserInput = z.infer<typeof addOrgUserInputSchema>;

export const createOrgUserInputSchema = z
  .object({
    orgId: idSchema,
    userId: idSchema,
    status: orgUserStatusSchema.optional(),
  })
  .strict();
export type CreateOrgUserInput = z.infer<typeof createOrgUserInputSchema>;

export const updateOrgUserInputSchema = z
  .object({
    status: orgUserStatusSchema.optional(),
  })
  .strict();
export type UpdateOrgUserInput = z.infer<typeof updateOrgUserInputSchema>;

export const createInviteInputSchema = z
  .object({
    email: emailSchema,
    roleKey: roleKeySchema.default('member'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    sendEmail: z.boolean().optional(),
  })
  .strict();
export type CreateInviteInput = z.input<typeof createInviteInputSchema>;

export const acceptInviteInputSchema = z
  .object({
    token: z.string().trim().min(1),
    authUserId: idSchema,
    email: emailSchema,
  })
  .strict();
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
