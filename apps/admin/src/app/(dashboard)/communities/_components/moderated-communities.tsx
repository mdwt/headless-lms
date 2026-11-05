import Link from "next/link";
import { ChevronRight, MessagesSquare } from "lucide-react";

import { EmptyState } from "@/components/data-table/states";
import { PageHeader } from "@/components/page-header";
import { formatNumber } from "@/lib/format";

export function ModeratedCommunities({
  communities,
}: {
  communities: { id: string; title: string; spaceCount: number }[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Communities"
        subtitle="The communities you moderate. You moderate them as a member."
      />
      {communities.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="Nothing to moderate here"
          description="You moderate a community while you're a member of it. Once you have access, it shows up here."
        />
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {communities.map((c) => (
            <li key={c.id}>
              <Link
                href={`/communities/${c.id}/moderation`}
                className="group flex items-center justify-between gap-4 rounded-card border border-line bg-surface px-5 py-4 outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-ink">{c.title}</span>
                  <span className="text-sm text-ink-3">
                    {formatNumber(c.spaceCount)} {c.spaceCount === 1 ? "space" : "spaces"} ·
                    Moderation queue
                  </span>
                </div>
                <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
