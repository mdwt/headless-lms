import { serverApi } from "@/lib/api/server";
import { requirePermission } from "@/lib/auth/server-permissions";
import { AccessGrantsList } from "@/components/access-grants-list";
import { GrantAccessButton } from "@/components/grant-access-button";

// Access tab: the students granted access to this download (entitlements), plus
// the download-scoped grant form.
export default async function DownloadAccessTab({
  params,
}: {
  params: Promise<{ downloadId: string }>;
}) {
  const { downloadId } = await params;
  const { permissions } = await requirePermission("access:read");
  const canGrant = permissions.has("access:write") && permissions.has("people:read");

  const [grants, students] = await Promise.all([
    serverApi.contentEntitlements(downloadId),
    canGrant ? serverApi.studentsLite() : Promise.resolve([]),
  ]);

  const granted = new Set(grants.map((g) => g.orgUserId));
  const candidates = students.filter((s) => !granted.has(s.id));

  return (
    <AccessGrantsList
      grants={grants}
      emptyDescription="Students granted access to this download will appear here."
      action={
        canGrant ? (
          <GrantAccessButton contentId={downloadId} contentNoun="download" students={candidates} />
        ) : undefined
      }
      emptyAction={
        canGrant ? (
          <GrantAccessButton
            contentId={downloadId}
            contentNoun="download"
            students={candidates}
            variant="secondary"
          />
        ) : undefined
      }
    />
  );
}
