import { KeyRound } from "lucide-react";

import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, relativeTime } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", import: "Import" };

// Access tab: the students granted access to this course (entitlements). Read
// only here — grants are managed from the Entitlements area.
export default async function CourseAccessTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const grantsPromise = serverApi.courseEntitlements(courseId);
  await requireAuth(grantsPromise);
  const grants = await grantsPromise;

  if (grants.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
          <KeyRound className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium tracking-tight text-ink">No one has access yet</h2>
          <p className="max-w-[44ch] text-pretty text-sm text-ink-3">
            Students granted access to this course will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-ink-2">
        Access <span className="tabular-nums text-ink-4">· {grants.length}</span>
      </h2>
      <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-medium whitespace-nowrap text-ink-3">
                <th scope="col" className="px-3 pb-3">
                  Student
                </th>
                <th scope="col" className="px-3 pb-3">
                  Status
                </th>
                <th scope="col" className="px-3 pb-3">
                  Source
                </th>
                <th scope="col" className="px-3 pb-3">
                  Granted
                </th>
                <th scope="col" className="px-3 pb-3">
                  Expires
                </th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-t border-line align-middle">
                  <td className="px-3 py-3.5">
                    <div className="flex flex-col">
                      <span className="font-medium text-ink">
                        {g.firstName} {g.lastName}
                      </span>
                      <span className="text-ink-4">{g.studentEmail}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <EntitlementStatusBadge status={g.status} />
                  </td>
                  <td className="px-3 py-3.5">
                    <Badge variant="outline">{SOURCE_LABEL[g.source] ?? g.source}</Badge>
                  </td>
                  <td className="px-3 py-3.5 text-ink-3">{relativeTime(g.grantedAt)}</td>
                  <td className="px-3 py-3.5 text-ink-3">
                    {g.expiresAt ? formatDate(g.expiresAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
