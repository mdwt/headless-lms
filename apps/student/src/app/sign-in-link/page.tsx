import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { SignInLinkForm } from "@/components/auth/sign-in-link-form";
import { sameSitePath } from "@/lib/next-path";

export const metadata: Metadata = { title: "Sign in with a link" };

export const dynamic = "force-dynamic";

export default async function SignInLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = sameSitePath((await searchParams).next);

  return (
    <AuthShell>
      <AuthHeading title="Sign in with a link">
        Enter your email and we&apos;ll send you a link that signs you in.
      </AuthHeading>
      <SignInLinkForm next={next} />
      <BackToSignIn next={next} />
    </AuthShell>
  );
}
