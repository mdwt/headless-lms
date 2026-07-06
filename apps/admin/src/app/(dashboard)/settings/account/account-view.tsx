"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOut } from "@/lib/auth/client";
import { useCurrentUser, useOrganization } from "@/lib/auth/session-context";
import { ROLE_LABEL } from "@/lib/roles";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Account tab: read-only profile + org membership, plus sign-out. */
export function AccountView() {
  const user = useCurrentUser();
  const organization = useOrganization();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex items-center gap-4">
        <NameAvatar name={user.name} image={user.image} className="size-12 text-sm" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-lg font-semibold tracking-tight text-ink">{user.name}</h2>
          <p className="truncate text-sm text-ink-3">{user.email}</p>
        </div>
      </div>

      <dl className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-5">
        <Row label="Organization" value={organization.name} />
        <Row label="Role" value={ROLE_LABEL[user.role]} />
      </dl>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">Sign out</span>
          <span className="text-sm text-ink-3">End your session on this device.</span>
        </div>
        <Button variant="destructive" onClick={handleSignOut} disabled={pending}>
          <LogOut />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
