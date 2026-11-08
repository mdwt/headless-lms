"use client";

import { Suspense, useCallback, useMemo, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable, isBlank } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { usePermissions } from "@/lib/auth/permissions-context";
import type { EventItem, ListParams } from "@/lib/api/types";

import { eventsColumns } from "./events-columns";
import { EventFormDialog } from "./_components/event-form-dialog";
import { deleteEventAction, setEventPublishedAction } from "./actions";

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function EventsTableInner({
  rows,
  total,
  params,
  now,
}: {
  rows: EventItem[];
  total: number;
  params: ListParams;
  now: number;
}) {
  const router = useRouter();
  const permissions = usePermissions();

  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const isStale = !sameParams(table.params, params);

  const [optimisticRows, applyOptimistic] = useOptimistic(
    rows,
    (state: EventItem[], patch: { id: string; status: EventItem["status"] }) =>
      state.map((e) => (e.id === patch.id ? { ...e, status: patch.status } : e)),
  );

  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<EventItem | null>(null);

  const canCreate = permissions.has("events:write");

  const goToDetail = useCallback(
    (event: EventItem) => router.push(`/events/${event.id}`),
    [router],
  );

  const onTogglePublish = useCallback(
    (event: EventItem) => {
      const next = event.status === "published" ? "draft" : "published";
      startTransition(async () => {
        applyOptimistic({ id: event.id, status: next });
        try {
          await setEventPublishedAction(event.id, next);
          toast.success(next === "published" ? "Event published" : "Moved to draft");
        } catch (e) {
          toast.error("Couldn't update status", { description: (e as Error).message });
        }
      });
    },
    [applyOptimistic],
  );

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const event = toDelete;
    startTransition(async () => {
      try {
        await deleteEventAction(event.id);
        toast.success("Event deleted");
        setToDelete(null);
      } catch (e) {
        toast.error("Couldn't delete event", { description: (e as Error).message });
      }
    });
  }, [toDelete]);

  const columns = useMemo(
    () =>
      eventsColumns({
        permissions,
        now,
        onView: goToDetail,
        onTogglePublish,
        onDelete: setToDelete,
      }),
    [permissions, now, goToDetail, onTogglePublish],
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Events"
        subtitle={
          isBlank(total, table) ? undefined : `${total} ${total === 1 ? "event" : "events"}`
        }
        actions={
          canCreate && !isBlank(total, table) ? (
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              New event
            </Button>
          ) : undefined
        }
      />

      <DataTable<EventItem>
        columns={columns}
        rows={optimisticRows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(e) => e.id}
        searchPlaceholder="Search events…"
        onRowClick={goToDetail}
        facets={[
          {
            columnId: "startsAt",
            title: "When",
            options: [
              { label: "Upcoming", value: "upcoming" },
              { label: "Past", value: "past" },
            ],
          },
          {
            columnId: "status",
            title: "Status",
            options: [
              { label: "Draft", value: "draft" },
              { label: "Published", value: "published" },
              { label: "Canceled", value: "canceled" },
            ],
          },
        ]}
        emptyTitle="No events yet"
        emptyDescription={
          canCreate ? "Get started by creating your first event." : "There are no events yet."
        }
        emptyAction={
          canCreate ? (
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              New event
            </Button>
          ) : undefined
        }
      />

      <EventFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Delete event?"
        description={
          toDelete ? (
            <>
              This permanently deletes{" "}
              <span className="font-medium text-ink">{toDelete.title}</span>. Its attendees lose it,
              and its files stay in the media library. This can&apos;t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete event"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function EventsTable(props: {
  rows: EventItem[];
  total: number;
  params: ListParams;
  now: number;
}) {
  return (
    <Suspense fallback={null}>
      <EventsTableInner {...props} />
    </Suspense>
  );
}
