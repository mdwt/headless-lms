"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

/** Clears the non-student session and lands on /login so a student can sign in. */
export function SignOutCta() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      await signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button variant="brand" size="pillSm" onClick={onClick} disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      Sign in as a student
    </Button>
  );
}
