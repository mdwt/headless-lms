"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { ModuleComposer } from "@/app/(dashboard)/courses/[courseId]/_components/module-list";
import { NewActivityDialog } from "@/app/(dashboard)/courses/[courseId]/_components/new-activity-dialog";
import type { ActivitySettings, ModuleTree } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function CurriculumPanel({
  courseId,
  modules,
  activityId,
  hrefFor,
  onNavigate,
}: {
  courseId: string;
  modules: ModuleTree[];
  activityId: string;
  hrefFor: (id: string) => string;
  onNavigate: (e: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2 pb-4">
      {modules.map((module, i) => (
        <section
          key={module.id}
          aria-labelledby={`module-${module.id}`}
          className="flex flex-col gap-0.5"
        >
          <h3
            id={`module-${module.id}`}
            className="flex h-8 items-center gap-1 px-2 text-[0.8125rem] font-semibold text-ink"
          >
            <span className="w-4 shrink-0 font-medium text-ink-4 tabular-nums">{i + 1}</span>
            <span className="min-w-0 truncate">{module.title}</span>
          </h3>
          <ul role="list" className="flex flex-col gap-0.5">
            {module.activities.map((activity) => {
              const settings = (activity.settings ?? {}) as ActivitySettings;
              const current = activity.id === activityId;
              return (
                <li key={activity.id}>
                  <Link
                    href={hrefFor(activity.id)}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2 rounded-md pr-2 pl-7 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      current ? "bg-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {settings.title?.trim() || "Untitled activity"}
                    </span>
                    {settings.published ? null : (
                      <span className="shrink-0 text-xs text-ink-4">Draft</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => setAddingTo(module.id)}
            className="flex h-8 items-center gap-1.5 rounded-md pr-2 pl-1.5 text-left text-[0.8125rem] text-ink-3 outline-none hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus className="size-4 shrink-0" />
            Add activity
          </button>
        </section>
      ))}

      <div className="px-2">
        <ModuleComposer courseId={courseId} />
      </div>

      <NewActivityDialog
        open={addingTo !== null}
        onOpenChange={(open) => {
          if (!open) setAddingTo(null);
        }}
        courseId={courseId}
        moduleId={addingTo ?? ""}
      />
    </div>
  );
}
