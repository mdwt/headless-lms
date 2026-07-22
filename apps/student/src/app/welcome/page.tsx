import { Suspense } from "react";
import type { Metadata } from "next";
import { WelcomeView } from "./welcome-view";

export const metadata: Metadata = { title: "Welcome — Headless LMS" };

export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <WelcomeView />
    </Suspense>
  );
}
