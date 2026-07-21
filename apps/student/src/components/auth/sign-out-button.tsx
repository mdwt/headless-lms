"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/client";

/** Signs the student out (clears the better-auth session) and returns to /login. */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const onClick = React.useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [pending, router]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Sign out"
      title="Sign out"
      className={
        className ??
        "grid size-[38px] place-items-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:bg-hover-surface disabled:opacity-50"
      }
    >
      <LogOut className="size-[18px]" strokeWidth={1.7} />
    </button>
  );
}
