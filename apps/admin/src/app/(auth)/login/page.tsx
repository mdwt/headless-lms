import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in — Headless LMS Management" };

// Any session at all goes to /onboarding — including one that turns out to be
// unusable, which /onboarding explains or clears. That leaves this page one job:
// credentials.
export default async function LoginPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink text-balance">
          Sign in to manage
        </h1>
        <p className="text-sm text-ink-3 text-pretty">
          Welcome back. Enter your credentials to access the back office.
        </p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-sm text-ink-3">
        New here?{" "}
        <Link href="/signup" className="font-medium text-brand underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}
