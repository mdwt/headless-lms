import { Suspense } from "react";
import type { Metadata } from "next";

import { requireCourseApp } from "@/lib/app";
import { LoginView } from "./login-view";

export async function generateMetadata(): Promise<Metadata> {
  const { organization } = await requireCourseApp();
  return { title: `Sign in — ${organization.name}` };
}

export default async function LoginPage() {
  const { organization } = await requireCourseApp();
  return (
    <Suspense>
      <LoginView orgName={organization.name} />
    </Suspense>
  );
}
