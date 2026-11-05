"use client";

import { useState, type ReactNode } from "react";
import { CornerUpLeft, Flag, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { CommentsConfig, CommentView, ReactionEmoji } from "@/lib/api/types";

import { cn } from "@/lib/utils";
import { fullName, relativeTime } from "@/lib/format";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { permissions } from "./comment-state";
import { CommentAvatar } from "./avatar";
import { CommentComposer } from "./comment-composer";
import { ReactionBar } from "./reaction-bar";

export function CommentItem({
  comment,
  config,
  orgUserId,
  viewerName,
  isReply = false,
  replies,
  onReply,
  onEdit,
  onRemove,
  onReact,
  onReport,
}: {
  comment: CommentView;
  config: CommentsConfig;
  orgUserId: string;
  viewerName: string;
  isReply?: boolean;
  /** Rendered under this comment's actions — the panel owns the reply list so
   *  each reply keeps its own handlers. */
  replies?: ReactNode;
  onReply?: (body: string) => Promise<void>;
  onEdit: (body: string) => Promise<void>;
  onRemove: () => Promise<void>;
  onReact: (emoji: ReactionEmoji | null) => Promise<void>;
  onReport: (reason: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const p = permissions(config, comment, orgUserId);
  const author = fullName(comment.author);

  if (comment.status === "removed") {
    return (
      <p className="py-2 text-[13px] text-ink-4 italic">
        {comment.removedBy
          ? `Comment removed by ${fullName(comment.removedBy)}`
          : "Comment removed"}
      </p>
    );
  }

  const hasMenu = p.canReply || p.canEdit || p.canRemove || p.canReport;

  return (
    <article className="flex gap-2.5">
      <CommentAvatar name={author} image={comment.author.image} size={isReply ? "sm" : "md"} />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "rounded-card rounded-tl-sm bg-surface-warm-2",
            isReply ? "px-3 py-2" : "px-3.5 py-2.5",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "font-semibold text-ink",
                  isReply ? "text-[12.5px]" : "text-[13.5px]",
                )}
              >
                {author}
              </span>
              {comment.author.team && comment.author.roleName && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                  style={{ background: "var(--brand-soft)", color: "var(--brand-strong)" }}
                >
                  {comment.author.roleName}
                </span>
              )}
              {comment.status === "pending" && (
                <span className="rounded bg-status-progress-bg px-1.5 py-0.5 text-[10.5px] font-medium text-status-progress-fg">
                  Awaiting review
                </span>
              )}
              <span className="text-[11.5px] text-ink-4">{relativeTime(comment.createdAt)}</span>
            </div>

            {hasMenu && !editing && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="-mr-1 grid size-6 shrink-0 place-items-center rounded-md text-ink-4 transition-colors hover:bg-hover-surface hover:text-ink"
                  aria-label="Comment actions"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-40">
                  {p.canReply && onReply && (
                    <DropdownMenuItem onSelect={() => setReplying(true)}>
                      <CornerUpLeft />
                      Reply
                    </DropdownMenuItem>
                  )}
                  {p.canEdit && (
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                  )}
                  {p.canReport && (
                    <DropdownMenuItem onSelect={() => void onReport("")}>
                      <Flag />
                      Report
                    </DropdownMenuItem>
                  )}
                  {p.canRemove && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="danger" onSelect={() => void onRemove()}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <CommentComposer
                placeholder="Edit your comment"
                submitLabel="Save"
                initialValue={comment.body ?? ""}
                rows={3}
                autoFocus
                onSubmit={onEdit}
                onCancel={() => setEditing(false)}
              />
            </div>
          ) : (
            <p
              className={cn(
                "mt-1 leading-relaxed whitespace-pre-wrap text-ink",
                isReply ? "text-[13.5px]" : "text-[14px]",
              )}
            >
              {comment.body}
            </p>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-1">
          <ReactionBar
            reactions={comment.reactions}
            viewerReaction={comment.viewerReaction}
            canReact={p.canReact}
            onReact={onReact}
          />
          {p.canReply && onReply && (
            <button
              type="button"
              onClick={() => setReplying((v) => !v)}
              className="text-[12px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              Reply
            </button>
          )}
        </div>

        {replies}

        {replying && onReply && (
          <div className="mt-3 flex gap-2.5">
            <CommentAvatar name={viewerName} size="sm" />
            <div className="min-w-0 flex-1">
              <CommentComposer
                placeholder={`Reply to ${author}`}
                submitLabel="Reply"
                rows={2}
                autoFocus
                onSubmit={onReply}
                onCancel={() => setReplying(false)}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
