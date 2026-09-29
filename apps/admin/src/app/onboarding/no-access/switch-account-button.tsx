"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function SwitchAccountButton() {
  const [pending, setPending] = useState(false);

  function switchAccount() {
    setPending(true);
    void signOut().finally(() => window.location.assign("/login"));
  }

  return (
    <Button variant="primary" className="mt-5 w-full" disabled={pending} onClick={switchAccount}>
      {pending && <Loader2 className="animate-spin" />}
      Sign in with a different account
    </Button>
  );
}
