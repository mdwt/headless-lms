"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Mail, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field } from "@/components/forms/field";
import { NameAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { relativeTime } from "@/lib/format";
import type { Space, SpaceMember } from "@/lib/api/types";

import { moveSpaceMemberAction, type SpaceMemberMove } from "../../../../../actions";

type Candidate = { id: string; name: string; email: string };

export function SpaceMembers({
  communityId,
  space,
  members,
  candidates,
}: {
  communityId: string;
  space: Space;
  members: SpaceMember[];
  candidates: Candidate[];
}) {
  const [isPending, startTransition] = useTransition();
  const [placing, setPlacing] = useState<"add" | "invite" | null>(null);
  const [removing, setRemoving] = useState<SpaceMember | null>(null);

  const requests = members.filter((m) => m.status === "requested");
  const invitations = members.filter((m) => m.status === "invited");
  const active = members.filter((m) => m.status === "active");

  function move(member: { orgUserId: string }, to: SpaceMemberMove, done: string) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          await moveSpaceMemberAction(communityId, space.id, member.orgUserId, to);
          toast.success(done);
          resolve(true);
        } catch (err) {
          toast.error("Couldn't complete", { description: (err as Error).message });
          resolve(false);
        }
      });
    });
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-3 tabular-nums">
          {space.capacity === null
            ? `${active.length} ${active.length === 1 ? "member" : "members"}`
            : `${active.length} of ${space.capacity} seats taken`}
        </p>
        <div className="flex flex-wrap gap-2">
          {space.accessRule === "by_invite" && (
            <Button variant="secondary" size="sm" onClick={() => setPlacing("invite")}>
              <Mail />
              Invite
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPlacing("add")}>
            <UserPlus />
            Add person
          </Button>
        </div>
      </div>

      {space.accessRule === "by_request" && (
        <MemberSection title="Requests" count={requests.length} empty="No one is waiting to join.">
          {requests.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              detail={`Asked ${relativeTime(m.createdAt)}`}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isPending}
                    onClick={() => move(m, "approve", `${m.name} approved`)}
                  >
                    <Check />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => move(m, "decline", "Request declined")}
                  >
                    <X />
                    Decline
                  </Button>
                </>
              }
            />
          ))}
        </MemberSection>
      )}

      {space.accessRule === "by_invite" && (
        <MemberSection title="Invitations" count={invitations.length} empty="No open invitations.">
          {invitations.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              detail={`Invited ${relativeTime(m.createdAt)}`}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => move(m, "remove", "Invitation cancelled")}
                >
                  <X />
                  Cancel invitation
                </Button>
              }
            />
          ))}
        </MemberSection>
      )}

      <MemberSection title="Members" count={active.length} empty="No one is in this space yet.">
        {active.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            detail={`Joined ${relativeTime(m.updatedAt)}`}
            actions={
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                onClick={() => setRemoving(m)}
              >
                Remove
              </Button>
            }
          />
        ))}
      </MemberSection>

      <PlaceDialog
        mode={placing}
        candidates={candidates}
        pending={isPending}
        onOpenChange={(open) => {
          if (!open) setPlacing(null);
        }}
        onSubmit={async (orgUserId) => {
          const mode = placing ?? "add";
          const ok = await move(
            { orgUserId },
            mode,
            mode === "invite" ? "Invitation sent" : "Added to the space",
          );
          if (ok) setPlacing(null);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Remove from space?"
        description={
          removing ? (
            <>
              <span className="font-medium text-ink">{removing.name}</span> loses access to{" "}
              {space.name}. They keep the rest of the community.
            </>
          ) : null
        }
        confirmLabel="Remove"
        destructive
        pending={isPending}
        onConfirm={async () => {
          if (removing && (await move(removing, "remove", `${removing.name} removed`)))
            setRemoving(null);
        }}
      />
    </div>
  );
}

function MemberSection({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {title}
        <span className="font-normal text-ink-4 tabular-nums">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-ink-4">{empty}</p>
      ) : (
        <ul role="list" className="flex flex-col divide-y divide-line border-y border-line">
          {children}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  detail,
  actions,
}: {
  member: SpaceMember;
  detail: string;
  actions: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <NameAvatar name={member.name} className="size-8" />
        <div className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-medium text-ink">{member.name}</p>
          <p className="truncate text-sm text-ink-4">
            {member.email ? `${member.email} · ` : ""}
            {detail}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
    </li>
  );
}

function PlaceDialog({
  mode,
  candidates,
  pending,
  onOpenChange,
  onSubmit,
}: {
  mode: "add" | "invite" | null;
  candidates: Candidate[];
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (orgUserId: string) => void;
}) {
  const [orgUserId, setOrgUserId] = useState("");
  const invite = mode === "invite";

  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(o) => {
        if (pending) return;
        if (!o) setOrgUserId("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{invite ? "Invite to space" : "Add to space"}</DialogTitle>
          <DialogDescription>
            {invite
              ? "They join once they accept the invitation."
              : "They're placed in the space straight away, with no request or invitation."}
          </DialogDescription>
        </DialogHeader>
        <Field id="space-person" label="Member of the community">
          <Combobox
            id="space-person"
            value={orgUserId}
            onValueChange={setOrgUserId}
            options={candidates.map((c) => ({
              value: c.id,
              label: c.name,
              description: c.email,
            }))}
            placeholder="Select a person"
            searchPlaceholder="Search by name or email…"
            emptyText="No members left to place."
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={pending || orgUserId === ""}
            onClick={() => onSubmit(orgUserId)}
          >
            {invite ? "Send invitation" : "Add to space"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
