"use client";

import { Suspense, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { GrantAccessButton } from "@/components/grant-access-button";
import type { LiteStudent } from "@/components/grant-access-dialog";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/lib/auth/session-context";
import { fullName } from "@/lib/format";
import { can } from "@/lib/roles";
import type { CommunityMember, ListParams } from "@/lib/api/types";

const ROLE: Record<
  CommunityMember["role"],
  { label: string; variant: "brand" | "neutral" | "outline" }
> = {
  owner: { label: "Owner", variant: "outline" },
  admin: { label: "Admin", variant: "outline" },
  instructor: { label: "Instructor", variant: "outline" },
  moderator: { label: "Moderator", variant: "brand" },
  student: { label: "Member", variant: "neutral" },
};

const columns: ColumnDef<CommunityMember, unknown>[] = [
  {
    id: "name",
    header: "Person",
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) => {
      const member = row.original;
      return (
        <div className="flex min-w-0 items-center gap-3">
          <NameAvatar name={fullName(member)} image={member.image} className="size-8" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{fullName(member)}</span>
            <span className="truncate text-ink-4">{member.email}</span>
          </div>
        </div>
      );
    },
  },
  {
    id: "role",
    header: "Role",
    enableSorting: false,
    cell: ({ row }) => {
      const role = ROLE[row.original.role];
      return <Badge variant={role.variant}>{role.label}</Badge>;
    },
  },
];

function sameParams(a: ListParams, b: ListParams): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function CommunityMembersTableInner({
  communityId,
  rows,
  total,
  params,
  grantCandidates,
}: {
  communityId: string;
  rows: CommunityMember[];
  total: number;
  params: ListParams;
  grantCandidates: LiteStudent[];
}) {
  const router = useRouter();
  const user = useCurrentUser();
  const table = useDataTable({ pageSize: params.pageSize, initialSort: params.sort });
  const canGrant = can.manageEntitlements(user);
  const memoColumns = useMemo(() => columns, []);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-pretty text-ink-3">
          Everyone with access to this community, granted directly or through a bundle.
        </p>
        {canGrant && (
          <GrantAccessButton
            contentId={communityId}
            contentNoun="community"
            students={grantCandidates}
            variant="secondary"
          />
        )}
      </div>
      <DataTable<CommunityMember>
        columns={memoColumns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={!sameParams(table.params, params)}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(m) => m.id}
        searchPlaceholder="Search by name or email…"
        emptyTitle="No members yet"
        emptyDescription="People appear here once they're granted the community, on its own or in a bundle."
      />
    </section>
  );
}

export function CommunityMembersTable(props: {
  communityId: string;
  rows: CommunityMember[];
  total: number;
  params: ListParams;
  grantCandidates: LiteStudent[];
}) {
  return (
    <Suspense fallback={null}>
      <CommunityMembersTableInner {...props} />
    </Suspense>
  );
}
