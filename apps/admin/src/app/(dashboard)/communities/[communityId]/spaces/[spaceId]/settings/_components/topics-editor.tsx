"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/forms/settings-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SpaceTopic } from "@/lib/api/types";

import { setSpaceTopicsAction } from "../../../../../actions";
import { SortableList, SortableRow } from "./sortable-row";

const MAX_TOPICS = 50;
const MAX_NAME = 60;

type Draft = { key: string; id?: string; name: string };

function draftsOf(topics: SpaceTopic[]): Draft[] {
  return topics.map((t) => ({ key: t.id, id: t.id, name: t.name }));
}

function problemOf(drafts: Draft[]): string | null {
  const names = drafts.map((d) => d.name.trim());
  if (names.some((n) => n === "")) return "Every topic needs a name.";
  if (names.some((n) => n.length > MAX_NAME))
    return `Keep topic names under ${MAX_NAME} characters.`;
  const lower = names.map((n) => n.toLowerCase());
  if (new Set(lower).size !== lower.length) return "Two topics have the same name.";
  return null;
}

export function TopicsEditor({
  communityId,
  spaceId,
  topics,
}: {
  communityId: string;
  spaceId: string;
  topics: SpaceTopic[];
}) {
  const [drafts, setDrafts] = useState(() => draftsOf(topics));
  const [server, setServer] = useState(topics);
  const [isPending, startTransition] = useTransition();

  if (topics !== server) {
    setServer(topics);
    setDrafts(draftsOf(topics));
  }

  const dirty =
    JSON.stringify(drafts.map((d) => [d.id ?? null, d.name.trim()])) !==
    JSON.stringify(topics.map((t) => [t.id, t.name]));
  const problem = problemOf(drafts);

  function rename(key: string, name: string) {
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, name } : d)));
  }

  function save() {
    startTransition(async () => {
      try {
        await setSpaceTopicsAction(
          communityId,
          spaceId,
          drafts.map((d) => (d.id ? { id: d.id, name: d.name.trim() } : { name: d.name.trim() })),
        );
        toast.success("Topics saved");
      } catch (err) {
        toast.error("Couldn't save topics", { description: (err as Error).message });
      }
    });
  }

  return (
    <SettingsSection
      title="Topics"
      description="When a space has topics, every post in it picks one and members can filter by them. A topic that posts use can be renamed but not removed."
      footer={
        <>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setDrafts(draftsOf(topics))}
            >
              Discard
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={isPending || !dirty || problem !== null}
            onClick={save}
          >
            {isPending ? "Saving…" : "Save topics"}
          </Button>
        </>
      }
    >
      {drafts.length > 0 && (
        <SortableList items={drafts} idOf={(d) => d.key} onReorder={setDrafts}>
          {drafts.map((draft, i) => (
            <SortableRow key={draft.key} id={draft.key} label={draft.name || `topic ${i + 1}`}>
              <Input
                name={`topic-${i}`}
                aria-label={`Topic ${i + 1}`}
                value={draft.name}
                maxLength={MAX_NAME}
                placeholder="Topic name"
                autoFocus={!draft.id && draft.name === ""}
                className="min-w-0 flex-1 border-transparent shadow-none focus-visible:border-line-strong"
                onChange={(e) => rename(draft.key, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${draft.name || "topic"}`}
                onClick={() => setDrafts((list) => list.filter((d) => d.key !== draft.key))}
              >
                <X />
              </Button>
            </SortableRow>
          ))}
        </SortableList>
      )}
      <div className="flex flex-col gap-2">
        {problem && dirty ? <p className="text-sm text-danger">{problem}</p> : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-fit"
          disabled={drafts.length >= MAX_TOPICS}
          onClick={() => setDrafts((list) => [...list, { key: crypto.randomUUID(), name: "" }])}
        >
          <Plus />
          Add topic
        </Button>
      </div>
    </SettingsSection>
  );
}
