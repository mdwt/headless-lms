import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { SwitchAccountButton } from "./switch-account-button";

export const metadata: Metadata = { title: "No access — Headless LMS" };

export default async function NoAccessPage() {
  const session = await getServerSession();
  if (session?.status !== "denied") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          No access to the back office
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          <span className="font-medium text-ink">{session.user.email}</span> is not a staff member
          of any organization. Ask an admin to invite you, or sign in with a different account.
        </p>
      </div>
      <SwitchAccountButton />
    </>
  );
}
