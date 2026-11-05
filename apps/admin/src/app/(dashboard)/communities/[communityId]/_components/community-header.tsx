"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronLeft, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CourseStatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/lib/auth/permissions-context";
import { formatNumber, relativeTime } from "@/lib/format";
import type { Community } from "@/lib/api/types";

import { deleteCommunityAndRedirectAction, setCommunityPublishedAction } from "../../actions";
import { CommunityTabsNav } from "./community-tabs-nav";

export function CommunityHeader({
  community,
  stats,
}: {
  community: Community;
  stats: { spaceCount: number; memberCount: number | null };
}) {
  const { id, title } = community;
  const permissions = usePermissions();
  const router = useRouter();
  const canManage = permissions.has("communities:write", id);
  const canDelete = permissions.has("communities:delete", id);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const published = community.status === "published";

  function onTogglePublish() {
    const next: Community["status"] = published ? "draft" : "published";
    startTransition(async () => {
      try {
        await setCommunityPublishedAction(id, next);
        toast.success(next === "published" ? "Community published" : "Moved to draft");
      } catch (e) {
        toast.error("Couldn't update status", { description: (e as Error).message });
        router.refresh();
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteCommunityAndRedirectAction(id);
      } catch (e) {
        toast.error("Couldn't delete community", { description: (e as Error).message });
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/communities"
        className="inline-flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-4" />
        Communities
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance text-ink">{title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-3">
            <CourseStatusBadge status={community.status} />
            <Dot />
            <span className="tabular-nums">
              {formatNumber(stats.spaceCount)} {stats.spaceCount === 1 ? "space" : "spaces"}
            </span>
            {stats.memberCount !== null ? (
              <>
                <Dot />
                <span className="tabular-nums">
                  {formatNumber(stats.memberCount)} {stats.memberCount === 1 ? "member" : "members"}
                </span>
              </>
            ) : null}
            <Dot />
            <span>Updated {relativeTime(community.updatedAt)}</span>
          </div>
        </div>

        {canManage && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant={published ? "secondary" : "primary"}
              onClick={onTogglePublish}
              disabled={isPending}
            >
              {published ? "Unpublish" : "Publish"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions" disabled={isPending}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem asChild>
                  <Link href={`/communities/${id}/settings/notifications`}>
                    <Bell />
                    Notifications
                  </Link>
                </DropdownMenuItem>
                {canDelete ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger" onSelect={() => setConfirmingDelete(true)}>
                      <Trash2 />
                      Delete community
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <CommunityTabsNav communityId={id} />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete community?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{title}</span>, its
            spaces, and everything members posted in them. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete community"
        destructive
        pending={isPending}
        onConfirm={onDelete}
      />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-ink-4">
      ·
    </span>
  );
}
