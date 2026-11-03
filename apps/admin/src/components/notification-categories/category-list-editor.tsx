"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsSection } from "@/components/forms/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  NotificationCategory,
  NotificationCategoryList,
  NotificationTypeInfo,
} from "@/lib/api/types";
import {
  SortableList,
  SortableRow,
} from "@/app/(dashboard)/communities/[communityId]/spaces/[spaceId]/settings/_components/sortable-row";

import { CategoryDialog, type CategorySpace } from "./category-dialog";
import { categoryLabel, channelLabel, reasonLabel } from "./labels";
import { problemsByCategory, type ListProblem, type ListRefusal } from "./problems";

type Draft = { id: string; category: NotificationCategory };

function draftsOf(categories: NotificationCategory[]): Draft[] {
  return categories.map((category, index) => ({ id: `${index}:${category.key}`, category }));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
  );
}

function sameList(a: NotificationCategory[], b: NotificationCategory[]): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function CategorySummary({
  category,
  channels,
}: {
  category: NotificationCategory;
  channels: string[];
}) {
  const offered = [
    ...channels.filter((c) => c in category.channels),
    ...Object.keys(category.channels).filter((c) => !channels.includes(c)),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-1 py-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-medium text-ink">{categoryLabel(category.key)}</span>
        <span className="font-mono text-xs text-ink-4">{category.key}</span>
        {category.perSpace ? <Badge variant="outline">Per space</Badge> : null}
      </div>
      <p className="font-mono text-xs text-pretty text-ink-3">
        {category.covers
          .map((cover) => `${cover.type} · ${cover.reasons.map(reasonLabel).join(", ")}`)
          .join("; ")}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-3">
        {offered.map((channel) => (
          <span key={channel} className="inline-flex items-center gap-1">
            {channelLabel(channel)} {category.channels[channel]!.default ? "on" : "off"}
            {category.channels[channel]!.locked ? (
              <Lock className="size-3 text-ink-4" aria-label="locked" />
            ) : null}
          </span>
        ))}
        {category.spaceDefaults && Object.keys(category.spaceDefaults).length > 0 ? (
          <span>
            {Object.keys(category.spaceDefaults).length} space{" "}
            {Object.keys(category.spaceDefaults).length === 1 ? "default" : "defaults"}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CategoryListEditor({
  scope,
  list,
  types,
  channels,
  spaces,
  save,
  reset,
}: {
  scope: "community" | "org";
  list: NotificationCategoryList;
  types: NotificationTypeInfo[];
  channels: string[];
  spaces: CategorySpace[] | null;
  save: (categories: NotificationCategory[]) => Promise<ListRefusal | null>;
  reset: () => Promise<void>;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(() => draftsOf(list.categories));
  const [server, setServer] = useState(list);
  const [problems, setProblems] = useState<ListProblem[]>([]);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (list !== server) {
    setServer(list);
    setDrafts(draftsOf(list.categories));
    setProblems([]);
  }

  const categories = drafts.map((d) => d.category);
  const dirty = !sameList(categories, list.categories);
  const { general, byIndex } = problemsByCategory(problems);
  const editingDraft = editing?.id ? drafts.find((d) => d.id === editing.id) : undefined;

  function update(next: Draft[]) {
    setDrafts(next);
    setProblems([]);
  }

  function onSave() {
    startTransition(async () => {
      try {
        const refusal = await save(categories);
        if (refusal) {
          setProblems(refusal.problems);
          toast.error("Couldn't save the categories", {
            description: "Fix the problems shown in the list.",
          });
          return;
        }
        toast.success("Categories saved");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't save the categories", { description: (err as Error).message });
      }
    });
  }

  function onReset() {
    startTransition(async () => {
      try {
        await reset();
        setConfirmingReset(false);
        toast.success("Default categories restored");
        router.refresh();
      } catch (err) {
        toast.error("Couldn't restore the defaults", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection
      title="Categories"
      description={
        scope === "community"
          ? "The switches on a member's notification settings in this community, in priority order. A notification files under the first category that covers it."
          : "The switches on a member's notification settings for courses, access and their account, in priority order. A notification files under the first category that covers it."
      }
      footer={
        <>
          {list.source === "stored" && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={isPending}
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw />
              Reset to default
            </Button>
          )}
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => update(draftsOf(list.categories))}
            >
              Discard
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={isPending || !dirty || drafts.length === 0}
            onClick={onSave}
          >
            {isPending ? "Saving…" : "Save categories"}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2 text-sm text-ink-3">
        {list.source === "default" ? (
          <>
            <Badge>Default</Badge>
            <span>Saving stores this list and stops following the server default.</span>
          </>
        ) : (
          <>
            <Badge variant="brand">Customised</Badge>
            <span>A stored list. Reset to default to follow the server default again.</span>
          </>
        )}
      </div>

      {general.length > 0 && (
        <ul role="list" className="flex flex-col gap-1">
          {general.map((problem) => (
            <li key={problem} className="text-sm text-danger">
              {problem}
            </li>
          ))}
        </ul>
      )}

      {drafts.length > 0 ? (
        <SortableList items={drafts} idOf={(d) => d.id} onReorder={update}>
          {drafts.map((draft, index) => (
            <SortableRow key={draft.id} id={draft.id} label={categoryLabel(draft.category.key)}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <CategorySummary category={draft.category} channels={channels} />
                {byIndex.get(index)?.map((problem) => (
                  <p key={problem} className="pb-1 text-sm text-danger">
                    {problem}
                  </p>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${categoryLabel(draft.category.key)}`}
                onClick={() => setEditing({ id: draft.id })}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${categoryLabel(draft.category.key)}`}
                onClick={() => update(drafts.filter((d) => d.id !== draft.id))}
              >
                <X />
              </Button>
            </SortableRow>
          ))}
        </SortableList>
      ) : (
        <p className="text-sm text-ink-3">No categories. Add one, or reset to the default list.</p>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        onClick={() => setEditing({ id: null })}
      >
        <Plus />
        Add category
      </Button>

      <CategoryDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        category={editingDraft?.category ?? null}
        takenKeys={drafts.filter((d) => d.id !== editing?.id).map((d) => d.category.key)}
        types={types}
        channels={channels}
        spaces={spaces}
        onSave={(category) =>
          update(
            editingDraft
              ? drafts.map((d) => (d.id === editingDraft.id ? { ...d, category } : d))
              : [...drafts, { id: crypto.randomUUID(), category }],
          )
        }
      />

      <ConfirmDialog
        open={confirmingReset}
        onOpenChange={setConfirmingReset}
        title="Reset to the default categories?"
        description="The stored list is removed and the server default applies again. Members' own settings for categories in the default list apply again."
        confirmLabel="Reset to default"
        pending={isPending}
        onConfirm={onReset}
      />
    </SettingsSection>
  );
}
