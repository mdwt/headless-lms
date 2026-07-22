// Rendered when the session is valid but doesn't resolve to a portal student —
// a staff login (dev shares the better-auth cookie across localhost ports), or
// a session whose student/org rows no longer exist. The Learn API answers 401
// for these; the server-side reads redirect here instead of crashing.
import { UserX } from "lucide-react";

import { SignOutCta } from "./sign-out-cta";

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center px-7 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
        <UserX className="size-7" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.01em]">No student access</h1>
      <p className="mb-[26px] text-[15.5px] leading-[1.6] text-ink-2">
        You&apos;re signed in, but this account doesn&apos;t have access to any courses here. Sign
        in with a student account to continue.
      </p>
      <SignOutCta />
    </main>
  );
}
