import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password — Headless LMS Management",
  referrer: "no-referrer",
};

// Better Auth's emailed link lands here with ?token=, or ?error=INVALID_TOKEN once used or expired.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token, error } = await searchParams;
  return <ResetPasswordForm token={typeof token === "string" && !error ? token : null} />;
}
