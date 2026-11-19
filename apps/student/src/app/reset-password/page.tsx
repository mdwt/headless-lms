/**
 * Where a password reset link lands (`/reset-password?token=…`). The API has
 * already checked the link; a link it refused arrives with `error` and no token.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell>
      {token ? (
        <>
          <AuthHeading title="Choose a new password">
            You&apos;ll use it the next time you sign in.
          </AuthHeading>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <>
          <AuthHeading title="This link didn't work" />
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle />
            <AlertDescription>
              The link has expired or was already used.{" "}
              <Link href="/forgot-password" className="font-medium underline underline-offset-4">
                Ask for a new one
              </Link>
              .
            </AlertDescription>
          </Alert>
        </>
      )}
      <BackToSignIn />
    </AuthShell>
  );
}
