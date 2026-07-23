// Invites resource schemas — domain-owned invitations (staff + student).
import { z } from "zod";

/** Roles an invitation can carry. Never owner. */
export const InviteRole = z.enum(["admin", "instructor", "student"]);
export type InviteRole = z.infer<typeof InviteRole>;

export const Invitation = z.object({
  id: z.string(),
  email: z.string(),
  role: InviteRole,
  status: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof Invitation>;

export const CreateInvite = z.object({
  email: z.email(),
  role: InviteRole,
});
export type CreateInvite = z.infer<typeof CreateInvite>;

export const ActivateInvite = z.object({ token: z.string().min(1) });
export type ActivateInvite = z.infer<typeof ActivateInvite>;

/** accepted → consumed for the current session; auth-required → sign up/in first. */
export const ActivateInviteResult = z.object({
  status: z.enum(["accepted", "auth-required"]),
  email: z.string(),
  role: InviteRole,
});
export type ActivateInviteResult = z.infer<typeof ActivateInviteResult>;

export const AcceptInvite = z.object({ token: z.string().min(1) });
export type AcceptInvite = z.infer<typeof AcceptInvite>;

export const AcceptInviteResult = z.object({ status: z.literal("accepted") });
export type AcceptInviteResult = z.infer<typeof AcceptInviteResult>;
