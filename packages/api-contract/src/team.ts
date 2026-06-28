// Team (org members) resource schemas.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

/** Org-scoped roles, mirrored from better-auth's organization plugin. */
export const Role = z.enum(["owner", "admin", "instructor", "student"]);
export type Role = z.infer<typeof Role>;

export const MemberStatus = z.enum(["active", "invited"]);
export type MemberStatus = z.infer<typeof MemberStatus>;

export const Member = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable().optional(),
  role: Role,
  status: MemberStatus,
  joinedAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
});
export type Member = z.infer<typeof Member>;

export const MembersQuery = ListQuery.extend({
  role: Role.optional(),
  status: MemberStatus.optional(),
});
export type MembersQuery = z.infer<typeof MembersQuery>;

export const MembersPage = paginated(Member);
export type MembersPage = z.infer<typeof MembersPage>;

export const InviteMember = z.object({
  email: z.string().email(),
  role: Role,
});
export type InviteMember = z.infer<typeof InviteMember>;

export const UpdateMemberRole = z.object({ role: Role });
export type UpdateMemberRole = z.infer<typeof UpdateMemberRole>;

export const MemberIdParam = z.object({ id: z.string() });
export type MemberIdParam = z.infer<typeof MemberIdParam>;
