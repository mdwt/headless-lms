import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { requireCourseApp } from "@/lib/app";
import { sameSitePath, withNext } from "@/lib/next-path";

export async function generateMetadata(): Promise<Metadata> {
  const { organization } = await requireCourseApp();
  return { title: `Choose a new password — ${organization.name}` };
}

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string | string[] }>;
}) {
  const { token, next: requested } = await searchParams;
  const next = sameSitePath(requested);

  return (
    <AuthShell>
      {token ? (
        <>
          <AuthHeading title="Choose a new password">
            You&apos;ll use it the next time you sign in.
          </AuthHeading>
          <ResetPasswordForm token={token} next={next} />
        </>
      ) : (
        <>
          <AuthHeading title="This link didn't work" />
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle />
            <AlertDescription>
              The link has expired or was already used.{" "}
              <Link
                href={withNext("/forgot-password", next)}
                className="font-medium underline underline-offset-4"
              >
                Ask for a new one
              </Link>
              .
            </AlertDescription>
          </Alert>
        </>
      )}
      <BackToSignIn next={next} />
    </AuthShell>
  );
}
