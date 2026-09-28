import { z } from 'zod';
import { idSchema, emailSchema } from './shared.js';

export const roleSchema = z.enum(['owner', 'admin', 'instructor', 'student']);
export type Role = z.infer<typeof roleSchema>;

export const orgUserStatusSchema = z.enum(['invited', 'active']);
export type OrgUserStatus = z.infer<typeof orgUserStatusSchema>;

export const inviteRoleSchema = z.enum(['admin', 'instructor', 'student']);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

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
    role: roleSchema,
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
    role: inviteRoleSchema,
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
    role: roleSchema,
  })
  .strict();
export type AddOrgUserInput = z.infer<typeof addOrgUserInputSchema>;

export const createOrgUserInputSchema = z
  .object({
    orgId: idSchema,
    userId: idSchema,
    role: roleSchema,
    status: orgUserStatusSchema.optional(),
  })
  .strict();
export type CreateOrgUserInput = z.infer<typeof createOrgUserInputSchema>;

export const updateOrgUserInputSchema = z
  .object({
    role: roleSchema.optional(),
    status: orgUserStatusSchema.optional(),
  })
  .strict();
export type UpdateOrgUserInput = z.infer<typeof updateOrgUserInputSchema>;

export const createInviteInputSchema = z
  .object({
    orgId: idSchema,
    email: emailSchema,
    role: inviteRoleSchema,
    inviterUserId: idSchema,
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    sendEmail: z.boolean().optional(),
  })
  .strict();
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

export const acceptInviteInputSchema = z
  .object({
    token: z.string().trim().min(1),
    userId: idSchema,
    email: emailSchema,
  })
  .strict();
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
