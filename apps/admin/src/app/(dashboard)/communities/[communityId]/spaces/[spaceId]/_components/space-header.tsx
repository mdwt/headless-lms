"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Settings2, Users } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/session-context";
import { can } from "@/lib/roles";
import type { Community, Space } from "@/lib/api/types";
import { cn } from "@/lib/utils";

import { deleteSpaceAndRedirectAction } from "../../../../actions";
import { SpaceAccessBadge } from "../../../_components/space-access";

export function SpaceHeader({ community, space }: { community: Community; space: Space }) {
  const user = useCurrentUser();
  const pathname = usePathname();
  const canManage = can.manageCommunities(user);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const base = `/communities/${community.id}/spaces/${space.id}`;

  const tabs = [
    ...(canManage ? [{ segment: "settings", label: "Settings", icon: Settings2 }] : []),
    { segment: "members", label: "Members", icon: Users },
  ];

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteSpaceAndRedirectAction(community.id, space.id);
      } catch (e) {
        toast.error("Couldn't delete space", { description: (e as Error).message });
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={`/communities/${community.id}/${canManage ? "spaces" : "moderation"}`}
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        {community.title}
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-ink">
            {space.name}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <SpaceAccessBadge rule={space.accessRule} />
            {space.capacity !== null && (
              <Badge variant="outline" className="tabular-nums">
                {space.capacity} {space.capacity === 1 ? "seat" : "seats"}
              </Badge>
            )}
          </div>
        </div>
        {canManage && (
          <Button
            variant="destructive"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
          >
            Delete space
          </Button>
        )}
      </div>

      <nav
        aria-label="Space sections"
        className="flex items-center gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)]"
      >
        {tabs.map(({ segment, label, icon: Icon }) => {
          const href = `${base}/${segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={segment}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap outline-none focus-visible:text-ink",
                active ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete space?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{space.name}</span> and
            every post, comment and reaction in it. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete space"
        destructive
        pending={isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}
