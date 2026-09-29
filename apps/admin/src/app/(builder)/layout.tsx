import type { ReactNode } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { SessionProvider } from "@/lib/auth/session-context";

export async function generateMetadata(): Promise<Metadata> {
  const session = await getServerSession();
  const org = session?.organization?.name?.trim();
  return { title: org ? `${org} - headless-lms` : "headless-lms" };
}

export default async function BuilderLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status !== "authenticated") redirect("/onboarding");

  return <SessionProvider session={session}>{children}</SessionProvider>;
}
