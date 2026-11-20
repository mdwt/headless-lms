import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { sameSitePath } from "@/lib/next-path";

export const metadata: Metadata = { title: "Reset your password" };

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sameSitePath((await searchParams).next);

  return (
    <AuthShell>
      <AuthHeading title="Reset your password">
        Enter your email and we&apos;ll send you a link to choose a new password.
      </AuthHeading>
      <ForgotPasswordForm next={next} />
      <BackToSignIn next={next} />
    </AuthShell>
  );
}
