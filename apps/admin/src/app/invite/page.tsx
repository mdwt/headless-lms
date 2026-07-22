import * as React from "react";
import type { Metadata } from "next";
import { InviteView } from "./invite-view";

export const metadata: Metadata = { title: "Join the team — Headless LMS" };

export default function InvitePage() {
  return (
    <React.Suspense>
      <InviteView />
    </React.Suspense>
  );
}
