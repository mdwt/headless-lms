import type { ReactNode } from "react";
import { KeyRound } from "lucide-react";

import { EntitlementStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import type { Entitlement } from "@/lib/api/types";

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", import: "Import" };

/**
 * The students granted access to one content item (course or download).
 * Entitlements are generic over content type, so this list is shared between
 * every content type's Access tab. `action`/`emptyAction` are the slots a page
 * uses to offer granting in place; without them the list is read-only.
 */
export function AccessGrantsList({
  grants,
  emptyDescription,
  action,
  emptyAction,
}: {
  grants: Entitlement[];
  emptyDescription: string;
  action?: ReactNode;
  emptyAction?: ReactNode;
}) {
  if (grants.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
          <KeyRound className="size-5" />
        </span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium tracking-tight text-ink">No one has access yet</h2>
          <p className="max-w-[44ch] text-pretty text-sm text-ink-3">{emptyDescription}</p>
        </div>
        {emptyAction}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-5">
      {action ? <div className="flex justify-end">{action}</div> : null}
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
                      <span className="font-medium text-ink">{fullName(g)}</span>
                      <span className="text-ink-4">{g.email}</span>
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
