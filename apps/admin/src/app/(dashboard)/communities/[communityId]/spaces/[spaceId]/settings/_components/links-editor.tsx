"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Download, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/forms/field";
import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ContentType, SpaceLinkRow } from "@/lib/api/types";

import {
  addSpaceLinkAction,
  removeSpaceLinkAction,
  reorderSpaceLinksAction,
} from "../../../../../actions";
import { SortableList, SortableRow } from "./sortable-row";

const TYPE: Record<ContentType, { label: string; group: string; icon: typeof BookOpen }> = {
  course: { label: "Course", group: "Courses", icon: BookOpen },
  download: { label: "Download", group: "Downloads", icon: Download },
  community: { label: "Community", group: "Communities", icon: Users },
};

export function LinksEditor({
  communityId,
  spaceId,
  links: initial,
  content,
}: {
  communityId: string;
  spaceId: string;
  links: SpaceLinkRow[];
  content: { id: string; title: string; type: ContentType }[];
}) {
  const router = useRouter();
  const [links, setLinks] = useState(initial);
  const [server, setServer] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (initial !== server) {
    setServer(initial);
    setLinks(initial);
  }

  const linked = new Set(links.map((l) => l.contentId));
  const options = content
    .filter((c) => !linked.has(c.id))
    .map((c) => ({ value: c.id, label: c.title, group: TYPE[c.type].group }));

  function reorder(next: SpaceLinkRow[]) {
    setLinks(next);
    startTransition(async () => {
      try {
        await reorderSpaceLinksAction(
          communityId,
          spaceId,
          next.map((l) => l.id),
        );
      } catch (err) {
        toast.error("Couldn't reorder links", { description: (err as Error).message });
        router.refresh();
      }
    });
  }

  function remove(link: SpaceLinkRow) {
    startTransition(async () => {
      try {
        await removeSpaceLinkAction(communityId, spaceId, link.id);
        toast.success("Link removed");
      } catch (err) {
        toast.error("Couldn't remove link", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection
      title="Links"
      description="Courses, downloads and communities shown in this space. A link doesn't give access; members open what they hold."
    >
      {links.length > 0 && (
        <SortableList items={links} idOf={(l) => l.id} onReorder={reorder}>
          {links.map((link) => {
            const type = TYPE[link.type];
            const Icon = type.icon;
            return (
              <SortableRow key={link.id} id={link.id} label={link.title}>
                <Icon className="size-4 shrink-0 text-ink-4" aria-hidden />
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <p className="truncate text-sm font-medium text-ink">{link.title}</p>
                  <p className="shrink-0 text-sm text-ink-4">{type.label}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${link.title}`}
                  disabled={isPending}
                  onClick={() => remove(link)}
                >
                  <X />
                </Button>
              </SortableRow>
            );
          })}
        </SortableList>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={options.length === 0}
        onClick={() => setAdding(true)}
      >
        <Plus />
        Add link
      </Button>

      <AddLinkDialog
        open={adding}
        onOpenChange={setAdding}
        options={options}
        onAdd={(contentId) => addSpaceLinkAction(communityId, spaceId, contentId)}
      />
    </SettingsSection>
  );
}

function AddLinkDialog({
  open,
  onOpenChange,
  options,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: { value: string; label: string; group: string }[];
  onAdd: (contentId: string) => Promise<void>;
}) {
  const [contentId, setContentId] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await onAdd(contentId);
        toast.success("Link added");
        setContentId("");
        onOpenChange(false);
      } catch (err) {
        toast.error("Couldn't add link", { description: (err as Error).message });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Add link</DialogTitle>
          <DialogDescription>
            The link is added at the end of the space&apos;s list.
          </DialogDescription>
        </DialogHeader>
        <Field id="space-link" label="Course, download or community">
          <Combobox
            id="space-link"
            value={contentId}
            onValueChange={setContentId}
            options={options}
            placeholder="Select content"
            searchPlaceholder="Search courses, downloads and communities…"
            emptyText="Nothing left to link."
          />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={isPending || contentId === ""}>
            Add link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
