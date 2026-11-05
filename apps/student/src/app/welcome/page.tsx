/**
 * Invite landing page — where an invited student arrives from the emailed link
 * (`/welcome?token=…`).
 *
 * Resolving the token here, before render, both validates it and yields the
 * invited email, so the address is a fact from the invitation row rather than
 * something the URL asserts. Only the auth form and the accept button are
 * client components.
 */
import type { Metadata } from "next";
import { People, type GetInviteResponse } from "@headless-lms/sdk";

import { AuthShell, AuthHeading } from "@/components/auth/auth-shell";
import { InviteProblem } from "@/components/welcome/invite-problem";
import { InviteAuthForm } from "@/components/welcome/invite-auth-form";
import { AcceptInviteCard } from "@/components/welcome/accept-invite-card";
import { getServerSession } from "@/lib/auth/server-session";
import { authHeaders } from "@/lib/api/server-call";
import { ApiError } from "@/lib/api/shared";
import { fullName } from "@/lib/format";

export const metadata: Metadata = { title: "Welcome — Headless LMS" };

// The link carries a one-time token, so there is nothing cacheable here.
export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  let invite: GetInviteResponse | undefined;
  if (token) {
    try {
      invite = await People.getInvite({ token }, await authHeaders());
    } catch (e) {
      // 404 is the answer for a forged, expired or already-used token — a page
      // state. Every other failure is a real one and stays unhandled.
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
  }

  if (!invite) {
    return (
      <AuthShell>
        <InviteProblem message="This invitation link is invalid or has expired." />
      </AuthShell>
    );
  }

  const session = await getServerSession();

  return (
    <AuthShell>
      {session ? (
        <>
          <AuthHeading title="You're invited">
            Accept this invitation to add the course to your account.
          </AuthHeading>
          <AcceptInviteCard
            token={token}
            invitedEmail={invite.email}
            sessionEmail={session.user.email}
          />
        </>
      ) : (
        <InviteAuthForm token={token} email={invite.email} name={fullName(invite)} />
      )}
    </AuthShell>
  );
}
