"use client";

import { useState, useTransition } from "react";
import { Check, CornerUpLeft, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import type { CommentStatus } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  approveCommentAction,
  moderateRemoveCommentAction,
  replyToCommentAction,
  resolveCommentReportsAction,
  restoreCommentAction,
} from "../actions";

/** Everything on a row that mutates: moderation buttons, the overflow menu and
 *  the inline reply composer. Pending state is this row's own. */
export function RowActions({
  id,
  status,
  flagged,
}: {
  id: string;
  status: CommentStatus;
  flagged: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [isPending, startTransition] = useTransition();
  const removed = status === "removed";

  function run(label: string, action: () => Promise<void>, done?: () => void) {
    startTransition(async () => {
      try {
        await action();
        done?.();
        toast.success(label);
      } catch (err) {
        toast.error("Could not complete", { description: (err as Error).message });
      }
    });
  }

  const approve = () => run("Approved", () => approveCommentAction(id));
  const remove = () => run("Removed", () => moderateRemoveCommentAction(id));
  const restore = () => run("Restored", () => restoreCommentAction(id));
  const dismiss = () => run("Reports dismissed", () => resolveCommentReportsAction(id));

  return (
    <>
      {replying && (
        <ReplyBox
          pending={isPending}
          onCancel={() => setReplying(false)}
          onSubmit={(body) =>
            run(
              "Reply posted",
              () => replyToCommentAction(id, body),
              () => setReplying(false),
            )
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {status === "pending" && (
          <Button size="sm" variant="primary" disabled={isPending} onClick={approve}>
            <Check />
            Approve
          </Button>
        )}
        {!removed && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => setReplying((v) => !v)}
          >
            <CornerUpLeft />
            Reply
          </Button>
        )}
        {removed ? (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={restore}>
            <RotateCcw />
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={isPending} onClick={remove}>
            <Trash2 />
            Remove
          </Button>
        )}
        {flagged && (
          <Button size="sm" variant="ghost" disabled={isPending} onClick={dismiss}>
            <X />
            Dismiss reports
          </Button>
        )}

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className="opacity-0 transition-opacity group-hover:opacity-100 aria-expanded:opacity-100"
              >
                <MoreHorizontal />
                <span className="sr-only">More actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-44">
              {!removed && (
                <DropdownMenuItem onSelect={() => setReplying(true)}>
                  <CornerUpLeft />
                  Reply
                </DropdownMenuItem>
              )}
              {status !== "published" && (
                <DropdownMenuItem onSelect={approve}>
                  <Check />
                  Publish
                </DropdownMenuItem>
              )}
              {flagged && (
                <DropdownMenuItem onSelect={dismiss}>
                  <X />
                  Dismiss reports
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {removed ? (
                <DropdownMenuItem onSelect={restore}>
                  <RotateCcw />
                  Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="danger" onSelect={remove}>
                  <Trash2 />
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

/** Reply as the moderator, inline under the comment being answered. */
function ReplyBox({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Reply as a moderator"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !trimmed}
          onClick={() => onSubmit(trimmed)}
        >
          Post reply
        </Button>
      </div>
    </div>
  );
}
