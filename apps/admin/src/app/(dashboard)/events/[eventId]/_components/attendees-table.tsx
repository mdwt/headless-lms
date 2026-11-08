"use client";

import { Suspense, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { RowActions } from "@/components/data-table/row-actions";
import { useDataTable } from "@/components/data-table/use-data-table";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/format";
import type { EventAttendee, ListParams } from "@/lib/api/types";

import { removeEventAttendeeAction } from "../../actions";
import { AddAttendeeButton, type LitePerson } from "./add-attendee-dialog";

const SOURCE_LABEL: Record<EventAttendee["source"], string> = {
  self: "Registered",
  manual: "Added",
  automation: "Automation",
  bundle: "Bundle",
};

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function columnsFor(
  canRemove: boolean,
  onRemove: (attendee: EventAttendee) => void,
): ColumnDef<EventAttendee, unknown>[] {
  return [
    {
      id: "name",
      header: "Attendee",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <NameAvatar name={row.original.name} image={row.original.avatarUrl} className="size-8" />
          <span className="truncate font-medium text-ink">{row.original.name}</span>
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      enableSorting: false,
      cell: ({ row }) => <Badge variant="outline">{SOURCE_LABEL[row.original.source]}</Badge>,
    },
    {
      id: "grantedAt",
      header: "Going since",
      enableSorting: false,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-3">{relativeTime(row.original.grantedAt)}</span>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) =>
        canRemove && row.original.source !== "bundle" ? (
          <div className="flex justify-end">
            <RowActions label="Attendee actions">
              <DropdownMenuItem variant="danger" onClick={() => onRemove(row.original)}>
                Remove
              </DropdownMenuItem>
            </RowActions>
          </div>
        ) : null,
    },
  ];
}

function AttendeesTableInner({
  eventId,
  rows,
  total,
  params,
  canRemove,
  canAdd,
  addBlockedReason,
  candidates,
  notifies,
}: {
  eventId: string;
  rows: EventAttendee[];
  total: number;
  params: ListParams;
  canRemove: boolean;
  canAdd: boolean;
  addBlockedReason: string | null;
  candidates: LitePerson[];
  notifies: boolean;
}) {
  const router = useRouter();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const [removing, setRemoving] = useState<EventAttendee | null>(null);
  const [isPending, startTransition] = useTransition();

  const columns = useMemo(() => columnsFor(canRemove, setRemoving), [canRemove]);

  function onConfirmRemove() {
    if (!removing) return;
    const attendee = removing;
    startTransition(async () => {
      try {
        await removeEventAttendeeAction(eventId, attendee.orgUserId);
        toast.success(`${attendee.name} removed`);
        setRemoving(null);
      } catch (e) {
        toast.error("Couldn't remove attendee", { description: (e as Error).message });
      }
    });
  }

  const add = canAdd ? (
    <AddAttendeeButton eventId={eventId} people={candidates} blockedReason={addBlockedReason} />
  ) : undefined;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-pretty text-ink-3">
          Everyone going, whether they registered, were added, or have it through a bundle.
        </p>
        {add}
      </div>
      <DataTable<EventAttendee>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={!sameParams(table.params, params) || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(a) => a.orgUserId}
        searchable={false}
        emptyTitle="No one is going yet"
        emptyDescription="People who register, are added, or get the event in a bundle appear here."
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove attendee?"
        description={
          <>
            <span className="font-medium text-ink">{removing?.name}</span> will no longer be going.
            {notifies ? " They'll be told." : ""}
          </>
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={onConfirmRemove}
      />
    </section>
  );
}

export function AttendeesTable(props: {
  eventId: string;
  rows: EventAttendee[];
  total: number;
  params: ListParams;
  canRemove: boolean;
  canAdd: boolean;
  addBlockedReason: string | null;
  candidates: LitePerson[];
  notifies: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <AttendeesTableInner {...props} />
    </Suspense>
  );
}
