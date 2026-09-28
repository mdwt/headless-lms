import { Flag } from "lucide-react";

import type { CommentListItem } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fullName, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<
  CommentListItem["status"],
  { label: string; variant: "success" | "warning" | "neutral" }
> = {
  published: { label: "Published", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  removed: { label: "Removed", variant: "neutral" },
};

/** Everything about a comment that is read-only: byline, badges, body, replies.
 *  Rendered on the server and handed to the client row as children. */
export function CommentBody({
  comment,
  replies,
}: {
  comment: CommentListItem;
  replies: CommentListItem[];
}) {
  const removed = comment.status === "removed";
  const status = STATUS[comment.status];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("text-sm font-semibold", removed ? "text-ink-3" : "text-ink")}>
          {fullName(comment.author)}
        </span>
        <span className="truncate text-xs text-ink-3">{comment.authorEmail}</span>
        <span className="text-ink-faint">·</span>
        <span className="text-xs text-ink-3">{relativeTime(comment.createdAt)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{comment.activityTitle}</Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
        {comment.reports.length > 0 && <ReportsBadge reports={comment.reports} />}
      </div>

      <p
        className={cn(
          "text-sm leading-relaxed whitespace-pre-wrap",
          removed ? "text-ink-3 line-through decoration-ink-faint" : "text-ink",
        )}
      >
        {comment.body}
      </p>

      {replies.map((reply) => (
        <Reply key={reply.id} reply={reply} />
      ))}
    </>
  );
}

function ReportsBadge({ reports }: { reports: CommentListItem["reports"] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="danger">
          <Flag />
          {reports.length} {reports.length === 1 ? "report" : "reports"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {reports
          .map((r) => `${fullName(r.reporter)}${r.reason ? ` — ${r.reason}` : ""}`)
          .join(" · ")}
      </TooltipContent>
    </Tooltip>
  );
}

function Reply({ reply }: { reply: CommentListItem }) {
  return (
    <div className="flex gap-2.5 rounded-card bg-muted/50s p-3">
      <NameAvatar name={fullName(reply.author)} image={reply.author.image} className="size-6" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink">{fullName(reply.author)}</span>
          {reply.author.role !== "student" && (
            <Badge variant="brand" className="capitalize">
              {reply.author.role}
            </Badge>
          )}
          <span className="text-xs text-ink-3">{relativeTime(reply.createdAt)}</span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
          {reply.body}
        </p>
      </div>
    </div>
  );
}
