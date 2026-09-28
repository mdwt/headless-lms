// Invites resource schemas — domain-owned invites (staff + student).
import { z } from 'zod';
import { emailSchema } from '@headless-lms/core/schemas';

/** Roles an invitation can carry. Never owner. */
export const InviteRole = z.enum(['admin', 'instructor', 'student']);
export type InviteRole = z.infer<typeof InviteRole>;

export const Invite = z.object({
  id: z.string(),
  email: z.string(),
  role: InviteRole,
  status: z.string(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});
export type Invite = z.infer<typeof Invite>;

/** A student is created by this call, not by the acceptance that follows it, so
 *  the admin names them here. `sendEmail: false` still creates everything —
 *  only delivery is skipped. Both are ignored for staff roles, whose org user
 *  is mirrored from the auth provider when they join. */
export const CreateInvite = z.object({
  email: emailSchema,
  role: InviteRole,
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  sendEmail: z.boolean().default(true),
});
export type CreateInvite = z.infer<typeof CreateInvite>;

export const ActivateInvite = z.object({ token: z.string().min(1) });
export type ActivateInvite = z.infer<typeof ActivateInvite>;

/** accepted → consumed for the current session; auth-required → sign up/in first.
 *  accountExists says which of the two: the invitee's email already has an
 *  account (sign in to link it) or it does not (create one). */
export const ActivateInviteResult = z.object({
  status: z.enum(['accepted', 'auth-required']),
  email: z.string(),
  role: InviteRole,
  accountExists: z.boolean(),
});
export type ActivateInviteResult = z.infer<typeof ActivateInviteResult>;

export const InviteTokenParam = z.object({ token: z.string().min(1) });
export type InviteTokenParam = z.infer<typeof InviteTokenParam>;

/** Everything the invite landing page needs to render: who the invitation is
 *  for, and the names the admin entered, which prefill sign-up. Whether the
 *  address already has a login is not reported — the sign-up form discovers
 *  that from a duplicate-signup rejection and switches to sign-in. */
export const GetInviteResult = z.object({
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});
export type GetInviteResult = z.infer<typeof GetInviteResult>;

/** Redeem: mints the session and accepts the invite in one request. `name` is
 *  required only when no account exists yet (the sign-up branch). The email is
 *  never sent — it is read from the invitation row, so it cannot be steered. */
export const RedeemInvite = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1).optional(),
});
export type RedeemInvite = z.infer<typeof RedeemInvite>;

export const RedeemInviteResult = z.object({ status: z.literal('accepted') });
export type RedeemInviteResult = z.infer<typeof RedeemInviteResult>;

export const AcceptInvite = z.object({ token: z.string().min(1) });
export type AcceptInvite = z.infer<typeof AcceptInvite>;

export const AcceptInviteResult = z.object({});
export type AcceptInviteResult = z.infer<typeof AcceptInviteResult>;
