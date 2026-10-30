"use client";

import { useTransition, type ReactNode } from "react";
import { Check, Flag, Lock, LockOpen, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fullName, relativeTime } from "@/lib/format";
import type { CommunityModeration, MessageQueueEntry } from "@/lib/api/types";

import {
  dismissMessageFlagsAction,
  moderateCommentAction,
  moderatePostAction,
  setChatLockedAction,
} from "../../../../actions";

type Person = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  imageUrl: string | null;
  image: string | null;
};

function nameOf(person: Person): string {
  return person.displayName || fullName(person) || "Unknown person";
}

export function ModerationQueue({
  communityId,
  moderation,
}: {
  communityId: string;
  moderation: CommunityModeration;
}) {
  const pending = moderation.spaces.flatMap((s) =>
    s.pending.map((post) => ({ space: s.space, post })),
  );
  const flaggedPosts = moderation.spaces.flatMap((s) =>
    s.flaggedPosts.map((item) => ({ space: s.space, ...item })),
  );
  const flaggedComments = moderation.spaces.flatMap((s) =>
    s.flaggedComments.map((item) => ({ space: s.space, ...item })),
  );
  const messages = moderation.messages;

  if (pending.length + flaggedPosts.length + flaggedComments.length + messages.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center">
        <ShieldCheck className="size-5 text-ink-3" aria-hidden />
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-medium tracking-tight text-ink">Nothing to review</h2>
          <p className="max-w-[44ch] text-sm text-pretty text-ink-3">
            Posts waiting for review and anything members flag show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {pending.length > 0 && (
        <QueueSection title="Awaiting review" count={pending.length}>
          {pending.map(({ space, post }) => (
            <QueueItem
              key={post.id}
              person={post.author}
              meta={
                <>
                  <Badge variant="outline">{space.name}</Badge>
                  <span>{relativeTime(post.createdAt)}</span>
                </>
              }
              title={post.title}
              body={post.body}
              actions={
                <ItemActions
                  actions={[
                    {
                      label: "Approve",
                      icon: <Check />,
                      variant: "primary",
                      done: "Post published",
                      run: () => moderatePostAction(communityId, post.id, "approve"),
                    },
                    {
                      label: "Remove",
                      icon: <Trash2 />,
                      variant: "destructive",
                      done: "Post removed",
                      run: () => moderatePostAction(communityId, post.id, "remove"),
                    },
                  ]}
                />
              }
            />
          ))}
        </QueueSection>
      )}

      {flaggedPosts.length > 0 && (
        <QueueSection title="Flagged posts" count={flaggedPosts.length}>
          {flaggedPosts.map(({ space, post, flags }) => (
            <QueueItem
              key={post.id}
              flagged
              person={post.author}
              meta={
                <>
                  <Badge variant="outline">{space.name}</Badge>
                  <span>{relativeTime(post.createdAt)}</span>
                </>
              }
              flags={flags.map((f) => f.reason)}
              title={post.title}
              body={post.body}
              actions={
                <ItemActions
                  actions={[
                    {
                      label: "Dismiss flags",
                      icon: <X />,
                      variant: "ghost",
                      done: "Flags dismissed",
                      run: () => moderatePostAction(communityId, post.id, "dismiss"),
                    },
                    {
                      label: "Remove post",
                      icon: <Trash2 />,
                      variant: "destructive",
                      done: "Post removed",
                      run: () => moderatePostAction(communityId, post.id, "remove"),
                    },
                  ]}
                />
              }
            />
          ))}
        </QueueSection>
      )}

      {flaggedComments.length > 0 && (
        <QueueSection title="Flagged comments" count={flaggedComments.length}>
          {flaggedComments.map(({ space, comment, authorName, flags }) => (
            <QueueItem
              key={comment.id}
              flagged
              person={{
                displayName: authorName,
                firstName: null,
                lastName: null,
                image: null,
                imageUrl: null,
              }}
              meta={<Badge variant="outline">{space.name}</Badge>}
              flags={flags.map((f) => f.reason)}
              body={comment.body}
              actions={
                <ItemActions
                  actions={[
                    {
                      label: "Dismiss flags",
                      icon: <X />,
                      variant: "ghost",
                      done: "Flags dismissed",
                      run: () => moderateCommentAction(communityId, comment.id, "dismiss"),
                    },
                    {
                      label: "Remove comment",
                      icon: <Trash2 />,
                      variant: "destructive",
                      done: "Comment removed",
                      run: () => moderateCommentAction(communityId, comment.id, "remove"),
                    },
                  ]}
                />
              }
            />
          ))}
        </QueueSection>
      )}

      {messages.length > 0 && (
        <QueueSection title="Flagged messages" count={messages.length}>
          {messages.map((entry) => (
            <MessageItem key={entry.message.id} communityId={communityId} entry={entry} />
          ))}
        </QueueSection>
      )}
    </div>
  );
}

function MessageItem({ communityId, entry }: { communityId: string; entry: MessageQueueEntry }) {
  const { message, chat, flags } = entry;
  const locked = chat.lockedAt !== null;
  return (
    <QueueItem
      flagged
      person={message.sender}
      meta={
        <>
          <Badge variant="outline">
            {chat.kind === "direct"
              ? "Direct message"
              : `Group chat · ${entry.participantIds.length}`}
          </Badge>
          {locked && (
            <Badge variant="warning">
              <Lock />
              Locked
            </Badge>
          )}
          <span>{relativeTime(message.createdAt)}</span>
        </>
      }
      flags={flags.map((f) => f.reason)}
      body={message.body}
      actions={
        <ItemActions
          actions={[
            {
              label: "Dismiss flags",
              icon: <X />,
              variant: "ghost",
              done: "Flags dismissed",
              run: () => dismissMessageFlagsAction(communityId, message.id),
            },
            locked
              ? {
                  label: "Unlock chat",
                  icon: <LockOpen />,
                  variant: "secondary",
                  done: "Chat unlocked",
                  run: () => setChatLockedAction(communityId, chat.id, false),
                }
              : {
                  label: "Lock chat",
                  icon: <Lock />,
                  variant: "destructive",
                  done: "Chat locked",
                  run: () => setChatLockedAction(communityId, chat.id, true),
                },
          ]}
        />
      }
    />
  );
}

function QueueSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {title}
        <span className="font-normal text-ink-4 tabular-nums">{count}</span>
      </h2>
      <ul role="list" className="flex flex-col gap-3">
        {children}
      </ul>
    </section>
  );
}

function QueueItem({
  person,
  meta,
  flags,
  flagged = false,
  title,
  body,
  actions,
}: {
  person: Person;
  meta: ReactNode;
  flags?: string[];
  flagged?: boolean;
  title?: string;
  body: string;
  actions: ReactNode;
}) {
  const name = nameOf(person);
  return (
    <li
      className={
        flagged
          ? "flex gap-3 rounded-card border border-danger/40 bg-surface p-4"
          : "flex gap-3 rounded-card border border-line bg-surface p-4"
      }
    >
      <NameAvatar name={name} image={person.imageUrl ?? person.image} className="size-9" />
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
          <span className="font-semibold text-ink">{name}</span>
          {meta}
        </div>
        {flags && flags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="danger" className="py-0.5 pr-2 pl-1.5 tabular-nums">
              <Flag />
              {flags.length} {flags.length === 1 ? "flag" : "flags"}
            </Badge>
            {flags
              .filter((reason) => reason.trim() !== "")
              .map((reason, i) => (
                <span key={i} className="text-sm text-ink-3">
                  “{reason}”
                </span>
              ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {title ? <p className="text-sm font-medium text-ink">{title}</p> : null}
          <p className="line-clamp-4 text-sm whitespace-pre-wrap text-ink-2">{body}</p>
        </div>
        {actions}
      </div>
    </li>
  );
}

type ItemAction = {
  label: string;
  icon: ReactNode;
  variant: "primary" | "secondary" | "ghost" | "destructive";
  done: string;
  run: () => Promise<void>;
};

function ItemActions({ actions }: { actions: ItemAction[] }) {
  const [isPending, startTransition] = useTransition();

  function run(action: ItemAction) {
    startTransition(async () => {
      try {
        await action.run();
        toast.success(action.done);
      } catch (err) {
        toast.error("Couldn't complete", { description: (err as Error).message });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.label}
          size="sm"
          variant={action.variant}
          disabled={isPending}
          onClick={() => run(action)}
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
