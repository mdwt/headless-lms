// Pure invite helpers for the better-invite integration: which app an invite
// link lands on, and whether a staged invite entitles a portal signup. Kept
// framework-free so the hook wiring in index.ts stays thin and this logic is
// unit-testable.

export const STUDENT_ROLE = 'student';

export function inviteLinkFor(
  role: string,
  token: string,
  email: string,
  urls: { studentPortalUrl: string; adminAppUrl: string },
): string {
  const base =
    role === STUDENT_ROLE ? `${urls.studentPortalUrl}/welcome` : `${urls.adminAppUrl}/invite`;
  const query = new URLSearchParams({ token, email });
  return `${base}?${query.toString()}`;
}

export interface InviteRecord {
  status: string;
  expiresAt: Date;
  email?: string | null;
  emails?: string[] | null;
}

export function inviteAllowsSignup(invite: InviteRecord | null, email: string, now: Date): boolean {
  if (!invite || invite.status !== 'pending') {
    return false;
  }
  if (new Date(invite.expiresAt) < now) {
    return false;
  }
  const invited = invite.emails ?? (invite.email ? [invite.email] : []);
  return invited.includes(email);
}
