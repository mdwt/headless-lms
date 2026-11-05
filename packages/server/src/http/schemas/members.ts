import { z } from 'zod';
import {
  contentTypeSchema,
  levelSchema,
  permissionSchema,
  roleKeySchema,
} from '@headless-lms/core/schemas';
import { ListQuery, paginated, OrgUserProfileSchema } from './shared.js';

export const MemberStatus = z.enum(['active', 'invited']);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const RoleRef = z.object({ key: z.string(), name: z.string() });

export const ItemRole = z.object({
  contentId: z.string(),
  contentType: contentTypeSchema,
  roleKey: z.string(),
  roleName: z.string(),
});

export const Member = OrgUserProfileSchema.extend({
  orgRole: RoleRef,
  isOwner: z.boolean(),
  items: z.array(ItemRole),
  status: MemberStatus,
  joinedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
});
export type Member = z.infer<typeof Member>;

export const MembersQuery = ListQuery.extend({
  roleKey: z.string().optional(),
  status: MemberStatus.optional(),
});
export type MembersQuery = z.infer<typeof MembersQuery>;

export const MembersPage = paginated(Member);
export type MembersPage = z.infer<typeof MembersPage>;

export const OrgUserIdParam = z.object({ orgUserId: z.string() });
export const OrgUserContentParam = z.object({ orgUserId: z.string(), contentId: z.string() });
export const ContentIdParam = z.object({ contentId: z.string() });
export const RoleKeyParam = z.object({ key: z.string() });

export const Assignment = z.object({
  orgUserId: z.string(),
  roleKey: z.string(),
  roleName: z.string(),
  contentId: z.string().nullable(),
  contentType: contentTypeSchema.nullable(),
});
export const AssignmentList = z.array(Assignment);

export const SetRole = z.object({ roleKey: roleKeySchema });

export const OrgRoleView = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  base: z.string(),
  levels: z.array(levelSchema),
  team: z.boolean(),
  permissions: z.array(permissionSchema),
  system: z.boolean(),
  added: z.boolean(),
  customized: z.boolean(),
  holders: z.number().int(),
});
export const OrgRoleList = z.array(OrgRoleView);

const PermissionChoices = z.partialRecord(permissionSchema, z.boolean());

export const UpdateRole = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(240).optional(),
    levels: z.array(levelSchema).min(1).optional(),
    team: z.boolean().optional(),
    permissions: PermissionChoices.optional(),
  })
  .strict();

export const CreateRole = z
  .object({
    base: roleKeySchema,
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240).optional(),
    levels: z.array(levelSchema).min(1).optional(),
    team: z.boolean().optional(),
    permissions: PermissionChoices.optional(),
  })
  .strict();

export const TransferOwnership = z
  .object({
    newOwnerOrgUserId: z.string().min(1),
    previousOwnerRoleKey: roleKeySchema.optional(),
  })
  .strict();
