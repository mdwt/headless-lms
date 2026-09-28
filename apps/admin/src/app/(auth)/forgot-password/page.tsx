import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password — Headless LMS Management" };

export default async function ForgotPasswordPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");

  return <ForgotPasswordForm />;
}
