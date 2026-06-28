import * as React from "react";
import type { Metadata } from "next";
import { LoginView } from "./login-view";

export const metadata: Metadata = { title: "Sign in — Atelier Management" };

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginView />
    </React.Suspense>
  );
}
